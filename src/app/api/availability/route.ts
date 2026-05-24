// Server-side availability endpoint using the Admin SDK.
// Exists to avoid PII exposure: a public Firestore query returns full booking
// documents (userId, userEmail, userName). This route returns only { bookedHours }
// and never touches the client SDK, so no booking PII reaches the browser.
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { adminDb } from "@/lib/firebase/admin-app";

export const dynamic = "force-dynamic";

let ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  ratelimit = new Ratelimit({
    redis:   Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(60, "60 s"),
    prefix:  "bookit:rl:availability",
  });
  return ratelimit;
}

export async function GET(req: NextRequest) {
  const rl = getRatelimit();
  if (rl) {
    const ip = req.headers.get("x-real-ip") ?? "anonymous";
    try {
      const { success } = await rl.limit(ip);
      if (!success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    } catch (err) {
      // Redis unavailable — fail open; blocking availability reads hurts UX more than the cost risk.
      console.error("[api/availability] rate-limit error:", err);
    }
  }

  const { searchParams } = req.nextUrl;
  const businessSlug = searchParams.get("businessSlug");
  const facilityId = searchParams.get("facilityId");
  const date = searchParams.get("date");
  const excludeBookingId = searchParams.get("excludeBookingId") ?? null;

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!businessSlug || !facilityId || !date) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }
  if (businessSlug.length > 64 || facilityId.length > 64) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const [confirmedSnap, pendingSnap] = await Promise.all([
    adminDb
      .collection("bookings")
      .where("businessSlug", "==", businessSlug)
      .where("facilityId", "==", facilityId)
      .where("date", "==", date)
      .where("status", "==", "confirmed")
      .get(),
    adminDb
      .collection("bookings")
      .where("businessSlug", "==", businessSlug)
      .where("facilityId", "==", facilityId)
      .where("date", "==", date)
      .where("status", "==", "slot_held")
      .get(),
  ]);

  const bookedHours: number[] = [];
  confirmedSnap.docs.forEach((doc) => {
    if (excludeBookingId && doc.id === excludeBookingId) return;
    (doc.data().hours as number[]).forEach((h) => bookedHours.push(h));
  });

  const pendingHours: number[] = [];
  pendingSnap.docs.forEach((doc) => {
    if (excludeBookingId && doc.id === excludeBookingId) return;
    (doc.data().hours as number[]).forEach((h) => pendingHours.push(h));
  });

  return NextResponse.json({ bookedHours, pendingHours });
}
