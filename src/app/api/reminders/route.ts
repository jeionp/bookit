// Daily cron endpoint — sends "your booking is tomorrow" reminders.
// Called by Vercel Cron (vercel.json) which injects Authorization: Bearer <CRON_SECRET>.
// Also callable manually with the same header for testing.
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";
import { getBusinessBySlug } from "@/lib/firebase/businesses";
import { sendBookingReminder } from "@/lib/notifications/email";
import type { Business } from "@/lib/types";

export const dynamic = "force-dynamic";

export function getTomorrowDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tomorrow = getTomorrowDateString();

  let snap;
  try {
    snap = await adminDb
      .collection("bookings")
      .where("status", "==", "confirmed")
      .where("date", "==", tomorrow)
      .get();
  } catch (err) {
    console.error("[api/reminders] Firestore query failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Filter out already-reminded docs and any with empty/missing hours (malformed docs
  // would produce "NaN:00 PM" in formatHours — skip them rather than sending bad email).
  const pending = snap.docs.filter((d) => {
    const b = d.data();
    return !b.reminderSent && Array.isArray(b.hours) && (b.hours as number[]).length > 0;
  });

  if (pending.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, date: tomorrow });
  }

  // Fetch each unique business once.
  const slugs = [...new Set(pending.map((d) => d.data().businessSlug as string))];
  const bizEntries = await Promise.all(slugs.map((s) => getBusinessBySlug(s)));
  const bizMap = new Map<string, Business>();
  slugs.forEach((s, i) => {
    const biz = bizEntries[i];
    if (biz) bizMap.set(s, biz);
  });

  // Use allSettled so a single failure does not abort the rest of the batch.
  // Email delivery failures inside sendBookingReminder are caught and logged there,
  // so `failed` here reflects only Firestore update failures — which risk duplicate
  // sends on the next cron run because the booking is left un-stamped.
  const results = await Promise.allSettled(
    pending.map(async (docSnap) => {
      const b = docSnap.data();
      const slug = b.businessSlug as string;
      const biz = bizMap.get(slug);
      if (!biz) return; // business deleted — skip silently, counts as fulfilled

      await sendBookingReminder({
        customerEmail:   b.userEmail    as string,
        customerName:    b.userName     as string,
        bookingId:       docSnap.id,
        businessName:    biz.name,
        businessEmail:   biz.email,
        businessAddress: biz.address,
        facilityName:    b.facilityName as string,
        date:            b.date         as string,
        hours:           b.hours        as number[],
      });
      await docSnap.ref.update({ reminderSent: true });
    }),
  );

  const sent   = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.error(`[api/reminders] ${failed} reminder(s) failed to stamp reminderSent — may resend tomorrow`);
  }

  return NextResponse.json({ sent, failed, date: tomorrow });
}
