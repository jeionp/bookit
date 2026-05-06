import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";
import { getBusinessBySlug } from "@/lib/firebase/businesses";

export const dynamic = "force-dynamic";

// Lazy singleton — only initialised when UPSTASH env vars are present.
// In emulator/test environments the vars are absent, so rate limiting is skipped.
let ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  ratelimit = new Ratelimit({
    redis:   Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    prefix:  "bookit:rl:bookings",
  });
  return ratelimit;
}

export interface CreateBookingRequest {
  facilityId: string;
  date: string;
  hours: number[];
  businessSlug: string;
}

async function calcPrice(businessSlug: string, facilityId: string, hours: number[]): Promise<{
  totalPrice: number;
  currency: string;
  facilityName: string;
  businessName: string;
} | null> {
  const biz = await getBusinessBySlug(businessSlug);
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
  const rl = getRatelimit();
  if (rl) {
    // x-real-ip is set by Vercel's edge and cannot be spoofed by clients.
    // x-forwarded-for leftmost value is client-controlled, so we avoid it.
    const ip = req.headers.get("x-real-ip") ?? "anonymous";
    try {
      const { success } = await rl.limit(ip);
      if (!success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    } catch (err) {
      // Redis unavailable — fail open so bookings are not blocked by infra issues.
      console.error("[api/bookings] rate-limit check failed:", err);
    }
  }

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

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!facilityId || !date || !Array.isArray(hours) || hours.length === 0 || !businessSlug) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (
    hours.length > 24 ||
    hours.some((h) => !Number.isInteger(h) || h < 0 || h > 23)
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const uniqueHours = [...new Set(hours)];

  // Recalculate price server-side from Firestore (source of truth)
  const priceInfo = await calcPrice(businessSlug, facilityId, uniqueHours);
  if (!priceInfo) {
    return NextResponse.json({ error: "Unknown business or facility" }, { status: 400 });
  }

  const newDocRef = adminDb.collection("bookings").doc();

  try {
    await adminDb.runTransaction(async (tx) => {
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

      if (uniqueHours.some((h) => takenHours.has(h))) {
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
        hours: uniqueHours,
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
