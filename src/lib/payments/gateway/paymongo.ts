import type {
  PaymentGateway,
  CreateSessionParams,
  GatewaySession,
  WebhookEvent,
  RefundParams,
  RefundResult,
} from "./types";

// Wire up when PayMongo credentials are available.
// Docs: https://developers.paymongo.com/docs/checkout-session
// Set PAYMENT_GATEWAY_PROVIDER=paymongo + PAYMENT_GATEWAY_SECRET_KEY + PAYMENT_GATEWAY_WEBHOOK_SECRET.
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

  verifyWebhook(_rawBody: string, _headers: Headers): WebhookEvent | null {
    // TODO: Verify HMAC-SHA256 signature from x-paymongo-signature header
    // Compute: HMAC-SHA256(webhookSecret, rawBody)
    // Normalise PayMongo event shape to WebhookEvent
    throw new Error(
      "PayMongoGateway.verifyWebhook not yet implemented — use PAYMENT_GATEWAY_PROVIDER=stub for testing",
    );
  }

  async issueRefund(_params: RefundParams): Promise<RefundResult> {
    // TODO: POST https://api.paymongo.com/v1/refunds
    throw new Error(
      "PayMongoGateway.issueRefund not yet implemented — use PAYMENT_GATEWAY_PROVIDER=stub for testing",
    );
  }
}
