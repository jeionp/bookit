// Cron endpoint — expires slot_held bookings where held_until < now.
// Called by Vercel Cron (vercel.json) which injects Authorization: Bearer <CRON_SECRET>.
// TODO (production): change vercel.json schedule from "0 1 * * *" to "0 * * * *" (hourly)
//   when upgrading to Vercel Pro — Hobby plan is capped at once-per-day.
import { NextRequest, NextResponse } from "next/server";
import { expireHeldSlots } from "@/lib/payments/expire-slots";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await expireHeldSlots();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/cron/expire-slots] Firestore error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
