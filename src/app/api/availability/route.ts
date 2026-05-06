// Server-side availability endpoint using the Admin SDK.
// Exists to avoid PII exposure: a public Firestore query returns full booking
// documents (userId, userEmail, userName). This route returns only { bookedHours }
// and never touches the client SDK, so no booking PII reaches the browser.
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  const snap = await adminDb
    .collection("bookings")
    .where("businessSlug", "==", businessSlug)
    .where("facilityId", "==", facilityId)
    .where("date", "==", date)
    .where("status", "==", "confirmed")
    .get();

  const bookedHours: number[] = [];
  snap.docs.forEach((doc) => {
    if (excludeBookingId && doc.id === excludeBookingId) return;
    (doc.data().hours as number[]).forEach((h) => bookedHours.push(h));
  });

  return NextResponse.json({ bookedHours });
}
