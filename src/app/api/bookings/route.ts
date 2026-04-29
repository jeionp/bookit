import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";
import { businesses } from "@/lib/businesses";

export interface CreateBookingRequest {
  facilityId: string;
  date: string;
  hours: number[];
  businessSlug: string;
}

function calcPrice(businessSlug: string, facilityId: string, hours: number[]): {
  totalPrice: number;
  currency: string;
  facilityName: string;
  businessName: string;
} | null {
  const biz = businesses.find((b) => b.slug === businessSlug);
  if (!biz) return null;
  const facility = biz.facilities.find((f) => f.id === facilityId);
  if (!facility) return null;

  const totalPrice = hours.reduce((sum, h) => {
    const isPrime =
      facility.primePricePerHour != null &&
      facility.primeTimeStart != null &&
      h >= facility.primeTimeStart;
    return sum + (isPrime ? facility.primePricePerHour! : facility.pricePerHour);
  }, 0);

  return {
    totalPrice,
    currency: facility.currency,
    facilityName: facility.name,
    businessName: biz.name,
  };
}

export async function POST(req: NextRequest) {
  // Verify the caller's Firebase ID token
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  let email: string;
  let displayName: string;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email ?? "";
    displayName = decoded.name ?? email;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreateBookingRequest;
  const { facilityId, date, hours, businessSlug } = body;

  if (!facilityId || !date || !Array.isArray(hours) || hours.length === 0 || !businessSlug) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Recalculate price server-side from the static business config (source of truth)
  const priceInfo = calcPrice(businessSlug, facilityId, hours);
  if (!priceInfo) {
    return NextResponse.json({ error: "Unknown business or facility" }, { status: 400 });
  }

  const newDocRef = adminDb.collection("bookings").doc();

  try {
    await adminDb.runTransaction(async (tx) => {
      // Check for conflicts: any confirmed booking on this court/date that overlaps
      const snap = await tx.get(
        adminDb
          .collection("bookings")
          .where("businessSlug", "==", businessSlug)
          .where("facilityId", "==", facilityId)
          .where("date", "==", date)
          .where("status", "==", "confirmed")
      );

      const takenHours = new Set<number>();
      snap.docs.forEach((d) => {
        (d.data().hours as number[]).forEach((h) => takenHours.add(h));
      });

      if (hours.some((h) => takenHours.has(h))) {
        throw new Error("SLOT_UNAVAILABLE");
      }

      tx.set(newDocRef, {
        userId: uid,
        userEmail: email,
        userName: displayName,
        businessSlug,
        businessName: priceInfo.businessName,
        facilityId,
        facilityName: priceInfo.facilityName,
        date,
        hours,
        totalPrice: priceInfo.totalPrice,
        currency: priceInfo.currency,
        status: "confirmed",
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_UNAVAILABLE") {
      return NextResponse.json({ error: "SLOT_UNAVAILABLE" }, { status: 409 });
    }
    console.error("[api/bookings] transaction error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ bookingId: newDocRef.id }, { status: 201 });
}
