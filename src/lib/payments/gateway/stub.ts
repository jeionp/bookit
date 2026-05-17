import type {
  PaymentGateway,
  CreateSessionParams,
  GatewaySession,
  WebhookEvent,
  WebhookEventType,
  RefundParams,
  RefundResult,
} from "./types";

export class StubGateway implements PaymentGateway {
  async createSession(params: CreateSessionParams): Promise<GatewaySession> {
    const sessionId = `stub_${params.bookingId}_${Date.now()}`;
    const query = new URLSearchParams({
      bookingId: params.bookingId,
      sessionId,
      amount: String(params.amountCents),
      currency: params.currency,
      description: params.description,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    });
    return {
      sessionId,
      checkoutUrl: `/pay/stub?${query.toString()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  verifyWebhook(rawBody: string, _headers: Headers): WebhookEvent | null {
    const VALID_TYPES: WebhookEventType[] = [
      "payment.succeeded",
      "payment.failed",
      "payment.expired",
    ];
    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      const { type, sessionId, bookingId, amountCents } = parsed;
      if (!VALID_TYPES.includes(type as WebhookEventType)) return null;
      if (
        typeof sessionId !== "string" ||
        typeof bookingId !== "string" ||
        typeof amountCents !== "number"
      ) return null;
      return { type: type as WebhookEventType, sessionId, bookingId, amountCents };
    } catch {
      return null;
    }
  }

  async issueRefund(_params: RefundParams): Promise<RefundResult> {
    return {
      refundId: `stub_refund_${Date.now()}`,
      status: "succeeded",
    };
  }
}
