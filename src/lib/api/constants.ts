/** Firestore collection names */
export const COLL = {
  BOOKINGS:      "bookings",
  BUSINESSES:    "businesses",
  ADMINS:        "admins",
  CREDIT_LEDGER: "credit_ledger",
  INVITES:       "invites",
} as const;

/** Valid payment_status_v2 values */
export const PAYMENT_STATUS_V2 = {
  PENDING_PROOF:   "pending_proof",
  AI_REVIEW:       "ai_review",
  PAID:            "paid",
  REJECTED:        "rejected",
  PENDING_CASH:    "pending_cash",
  PENDING_GATEWAY: "pending_gateway",
} as const;

export type PaymentStatusV2 = (typeof PAYMENT_STATUS_V2)[keyof typeof PAYMENT_STATUS_V2];

export const PAYMENT_STATUS_V2_VALUES = new Set<string>(Object.values(PAYMENT_STATUS_V2));
