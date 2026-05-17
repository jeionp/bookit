export interface CreateSessionParams {
  bookingId: string;
  amountCents: number;
  currency: string;
  description: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}

export interface GatewaySession {
  sessionId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

export type WebhookEventType = "payment.succeeded" | "payment.failed" | "payment.expired";

export interface WebhookEvent {
  type: WebhookEventType;
  sessionId: string;
  bookingId: string;
  amountCents: number;
}

export interface RefundParams {
  sessionId: string;
  amountCents: number;
  reason: string;
}

export interface RefundResult {
  refundId: string;
  status: "pending" | "succeeded" | "failed";
}

export interface PaymentGateway {
  createSession(params: CreateSessionParams): Promise<GatewaySession>;
  // Returns a normalised WebhookEvent on success, null for unrecognised event types.
  // Throws if the signature is invalid.
  verifyWebhook(rawBody: string, headers: Headers): WebhookEvent | null;
  issueRefund(params: RefundParams): Promise<RefundResult>;
}
