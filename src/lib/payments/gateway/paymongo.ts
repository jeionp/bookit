import { createHmac, timingSafeEqual } from "crypto";
import type {
  PaymentGateway,
  CreateSessionParams,
  GatewaySession,
  WebhookEvent,
  WebhookEventType,
  RefundParams,
  RefundResult,
} from "./types";

// Wire up when PayMongo credentials are available.
// Docs: https://developers.paymongo.com/docs/checkout-session
// Set PAYMENT_GATEWAY_PROVIDER=paymongo + PAYMENT_GATEWAY_SECRET_KEY + PAYMENT_GATEWAY_WEBHOOK_SECRET.

const EVENT_MAP: Record<string, WebhookEventType> = {
  "checkout_session.payment.paid":     "payment.succeeded",
  "checkout_session.payment.failed":   "payment.failed",
  "checkout_session.payment.expired":  "payment.expired",
};

export class PayMongoGateway implements PaymentGateway {
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  async createSession(_params: CreateSessionParams): Promise<GatewaySession> {
    // TODO: POST https://api.paymongo.com/v1/checkout_sessions
    // Auth: Basic base64(secretKey + ":")
    // Body: { data: { attributes: { line_items, payment_method_types, success_url, cancel_url, metadata } } }
    // Returns: { data: { id, attributes: { checkout_url } } }
    throw new Error(
      "PayMongoGateway.createSession not yet implemented — use PAYMENT_GATEWAY_PROVIDER=stub for testing",
    );
  }

  verifyWebhook(rawBody: string, headers: Headers): WebhookEvent | null {
    // PayMongo signature header format: "t=<timestamp>,te=<test_sig>,li=<live_sig>"
    // Signed payload: "<timestamp>.<rawBody>"
    const sigHeader = headers.get("x-paymongo-signature") ?? "";
    const parts = Object.fromEntries(
      sigHeader.split(",").map((p) => p.split("=", 2) as [string, string]),
    );
    const timestamp = parts["t"];
    const signature = parts["te"] ?? parts["li"];
    if (!timestamp || !signature) {
      throw new Error("Missing PayMongo signature header");
    }

    const payload = `${timestamp}.${rawBody}`;
    const expected = createHmac("sha256", this.webhookSecret)
      .update(payload)
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(signature, "hex");
    if (
      expectedBuf.length !== actualBuf.length ||
      !timingSafeEqual(expectedBuf, actualBuf)
    ) {
      throw new Error("Invalid PayMongo webhook signature");
    }

    // Reject events older than 5 minutes to guard against replay attacks
    const ts = parseInt(timestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
      throw new Error("PayMongo webhook timestamp too old");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new Error("Invalid webhook body");
    }

    const data = (parsed["data"] as Record<string, unknown>) ?? {};
    const attrs = (data["attributes"] as Record<string, unknown>) ?? {};
    const rawType = attrs["type"] as string | undefined;
    const type = rawType ? EVENT_MAP[rawType] : undefined;
    if (!type) return null; // unrecognised event — ack without processing

    const sessionData = (attrs["data"] as Record<string, unknown>) ?? {};
    const sessionId = sessionData["id"] as string | undefined;
    const sessionAttrs = (sessionData["attributes"] as Record<string, unknown>) ?? {};
    const metadata = (sessionAttrs["metadata"] as Record<string, string>) ?? {};
    const bookingId = metadata["bookingId"];
    const amountCents = sessionAttrs["amount"] as number | undefined;

    if (!sessionId || !bookingId || typeof amountCents !== "number") {
      throw new Error("Webhook payload missing required fields");
    }

    return { type, sessionId, bookingId, amountCents };
  }

  async issueRefund(_params: RefundParams): Promise<RefundResult> {
    // TODO: POST https://api.paymongo.com/v1/refunds
    throw new Error(
      "PayMongoGateway.issueRefund not yet implemented — use PAYMENT_GATEWAY_PROVIDER=stub for testing",
    );
  }
}
