import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";
import { processWebhookEvent } from "@/lib/payments/process-webhook";
import { requireString } from "@/lib/api/validation";
import type { WebhookEvent } from "@/lib/payments/gateway";

export const dynamic = "force-dynamic";

// Stub-only endpoint — triggers the webhook processing logic directly without a real provider.
// Guarded by two conditions: provider must be "stub" AND we must not be in production.
export async function POST(req: NextRequest) {
  if (
    process.env.PAYMENT_GATEWAY_PROVIDER !== "stub" ||
    process.env.NODE_ENV === "production"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let bookingId: string;
  let outcome: "success" | "failure";
  try {
    const body = (await req.json()) as { bookingId?: unknown; outcome?: unknown };
    const id = requireString(body.bookingId);
    if (!id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    if (body.outcome !== "success" && body.outcome !== "failure") {
      return NextResponse.json({ error: "outcome must be 'success' or 'failure'" }, { status: 400 });
    }
    bookingId = id;
    outcome = body.outcome;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const snap = await adminDb.collection("bookings").doc(bookingId).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const booking = snap.data()!;

  const event: WebhookEvent = {
    type: outcome === "success" ? "payment.succeeded" : "payment.failed",
    sessionId: (booking.gateway_session_id as string | undefined) ?? `stub_${bookingId}`,
    bookingId,
    amountCents: Math.round((booking.totalPrice as number) * 100),
  };

  try {
    const result = await processWebhookEvent(event);
    return NextResponse.json({ ok: result.ok });
  } catch (err) {
    console.error("[simulate] processing error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
