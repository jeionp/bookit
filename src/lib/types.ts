export type BusinessType = "court" | "appointment" | "room";

export type CreditLedgerTrigger =
  | "gateway_webhook"
  | "ai_verify"
  | "admin_approve"
  | "admin_mark_paid";

export interface CreditLedgerEntry {
  id: string;
  businessSlug: string;
  bookingId: string;
  trigger: CreditLedgerTrigger;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string; // ISO date string from API
}

export interface CancellationPolicy {
  freeCancelHours: number;    // default 24 — cancel before this = full credit/refund
  noCancelHours: number;      // default 2  — cancel within this = blocked
  creditValidityDays: number; // default 365
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  freeCancelHours: 24,
  noCancelHours: 2,
  creditValidityDays: 365,
};

export interface Credit {
  id: string;
  userId: string;
  businessSlug: string;
  businessName: string;
  amount: number;
  currency: string;
  type: "issued" | "redeemed";
  reason: "cancellation";
  sourceBookingId: string;
  redeemedBookingId?: string;
  expiresAt: import("firebase/firestore").Timestamp;
  createdAt: import("firebase/firestore").Timestamp;
  voided?: boolean;
}

export interface Facility {
  id: string;
  name: string;
  description: string;
  image: string;
  pricePerHour: number;       // base/normal rate
  primePricePerHour?: number; // prime time rate (optional)
  primeTimeStart?: number;    // hour when prime time begins e.g. 17 = 5 PM
  currency: string;
  operatingHours?: OperatingHours[];
}

export interface OperatingHours {
  day: string;
  open: string;
  close: string;
  closed?: boolean;
}

export interface Business {
  slug: string;
  name: string;
  type: BusinessType;
  tagline: string;
  description: string;
  coverImage: string;
  location: string;
  address: string;
  phone: string;
  email: string;
  accentColor: string;
  rating: number;
  reviewCount: number;
  facilities: Facility[];
  amenities: string[];
  operatingHours: OperatingHours[];
  ownerId?: string;
  status?: "active" | "suspended";
  cancellationPolicy?: CancellationPolicy;
  // Payment options — absent on legacy businesses (instant-confirm flow unchanged).
  // Both can be true; player picks at checkout.
  accepts_qr?: boolean;      // P2P GCash QR + AI receipt verification
  accepts_cash?: boolean;    // Pay at Venue — cash collected on the day
  accepts_gateway?: boolean; // Online payment gateway (PayMongo / Xendit / HitPay)
  saas_credit_balance?: number;
  static_qr_url?: string | null;
  gateway_sub_account_id?: string | null;
}
