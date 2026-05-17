// Hourly cron endpoint — expires slot_held bookings where held_until < now.
// Called by Vercel Cron (vercel.json) which injects Authorization: Bearer <CRON_SECRET>.
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
