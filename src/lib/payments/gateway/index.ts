import { StubGateway } from "./stub";
import { PayMongoGateway } from "./paymongo";

export type {
  PaymentGateway,
  CreateSessionParams,
  GatewaySession,
  WebhookEvent,
  WebhookEventType,
  RefundParams,
  RefundResult,
} from "./types";

export function createGateway() {
  const provider = process.env.PAYMENT_GATEWAY_PROVIDER ?? "stub";
  switch (provider) {
    case "paymongo": {
      const secretKey = process.env.PAYMENT_GATEWAY_SECRET_KEY;
      const webhookSecret = process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;
      if (!secretKey || !webhookSecret) {
        throw new Error(
          "PAYMENT_GATEWAY_SECRET_KEY and PAYMENT_GATEWAY_WEBHOOK_SECRET are required for the paymongo provider",
        );
      }
      return new PayMongoGateway(secretKey, webhookSecret);
    }
    case "stub":
    default:
      return new StubGateway();
  }
}
