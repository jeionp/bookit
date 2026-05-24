import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin-app";
import { requireUser, isAdminOf } from "@/lib/api/auth";
import { isYmdDate } from "@/lib/api/validation";
import { COLL } from "@/lib/api/constants";
import { SlotUnavailableError } from "@/lib/firebase/bookings";
import type { Facility } from "@/lib/types";

interface RescheduleRequest {
  bookingId:   string;
  facilityId:  string;
  date:        string;
  hours:       number[];
}

function computePrice(facility: Facility, hours: number[]): number {
  return hours.reduce((sum, h) => {
    const isPrime = facility.primeTimeStart != null && h >= facility.primeTimeStart;
    return sum + (isPrime ? (facility.primePricePerHour ?? facility.pricePerHour) : facility.pricePerHour);
  }, 0);
}

export async function POST(req: NextRequest) {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const uid = tokenOrRes.uid;

  let body: RescheduleRequest;
  try {
    body = (await req.json()) as RescheduleRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { bookingId, facilityId, date, hours } = body;

  if (!bookingId || !facilityId || !isYmdDate(date)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (
    !Array.isArray(hours) ||
    hours.length === 0 ||
    hours.length > 24 ||
    hours.some((h) => !Number.isInteger(h) || h < 0 || h > 23) ||
    new Set(hours).size !== hours.length
  ) {
    return NextResponse.json({ error: "Invalid hours" }, { status: 400 });
  }

  const bookingSnap = await adminDb.collection(COLL.BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  const booking = bookingSnap.data()!;
  const businessSlug = booking.businessSlug as string;

  if (!(await isAdminOf(uid, businessSlug))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bizSnap = await adminDb.collection(COLL.BUSINESSES).doc(businessSlug).get();
  if (!bizSnap.exists) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  const facilities = (bizSnap.data()?.facilities ?? []) as Facility[];
  const facility = facilities.find((f) => f.id === facilityId);
  if (!facility) {
    return NextResponse.json({ error: "Facility not found" }, { status: 404 });
  }

  const sorted = hours.slice().sort((a, b) => a - b);
  const totalPrice = computePrice(facility, sorted);

  const bookingRef = adminDb.collection(COLL.BOOKINGS).doc(bookingId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const existing = await adminDb
        .collection(COLL.BOOKINGS)
        .where("businessSlug", "==", businessSlug)
        .where("facilityId", "==", facilityId)
        .where("date", "==", date)
        .where("status", "==", "confirmed")
        .get();

      const takenHours = new Set<number>(
        existing.docs
          .filter((d) => d.id !== bookingId)
          .flatMap((d) => d.data().hours as number[]),
      );

      if (sorted.some((h) => takenHours.has(h))) throw new SlotUnavailableError();

      tx.update(bookingRef, {
        facilityId,
        facilityName: facility.name,
        date,
        hours: sorted,
        totalPrice,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true, totalPrice, facilityName: facility.name });
}
