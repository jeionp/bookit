import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const businessSlug = searchParams.get("businessSlug");
  const facilityId = searchParams.get("facilityId");
  const date = searchParams.get("date");
  const excludeBookingId = searchParams.get("excludeBookingId") ?? null;

  if (!businessSlug || !facilityId || !date) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
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
