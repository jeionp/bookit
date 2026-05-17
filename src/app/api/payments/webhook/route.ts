import { NextRequest, NextResponse } from "next/server";
import { createGateway } from "@/lib/payments/gateway";
import { processWebhookEvent } from "@/lib/payments/process-webhook";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const gateway = createGateway();

  let event: ReturnType<typeof gateway.verifyWebhook>;
  try {
    event = gateway.verifyWebhook(rawBody, req.headers);
  } catch (err) {
    console.error("[webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!event) {
    // Unrecognised event type — acknowledge to stop provider retries
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await processWebhookEvent(event);
    return NextResponse.json({ ok: result.ok }, { status: result.status ?? 200 });
  } catch (err) {
    console.error("[webhook] processing error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
