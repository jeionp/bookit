import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";
import { DEFAULT_CANCELLATION_POLICY, CancellationPolicy } from "@/lib/types";
import { sendCancellationReceipt, sendAdminCancellationNotification } from "@/lib/notifications/email";

// Returned for slot_held/pending_cash cancellations where no payment was made.
const NO_PAYMENT_CANCEL_RESPONSE: CancelBookingResponse = {
  tier: "free",
  refundRatio: 0,
  creditAmount: 0,
  currency: "PHP",
};

export const dynamic = "force-dynamic";

export interface CancelBookingRequest {
  bookingId: string;
  choice: "credit" | "refund_pending";
}

export interface CancelBookingResponse {
  tier: "free" | "prorated" | "blocked";
  refundRatio: number;
  creditAmount: number;
  currency: string;
}

export function getBookingStartMs(date: string, firstHour: number): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, firstHour, 0, 0, 0).getTime();
}

export function computeTier(
  bookingStartMs: number,
  policy: CancellationPolicy,
): { tier: "free" | "prorated" | "blocked"; refundRatio: number } {
  const hoursUntil = (bookingStartMs - Date.now()) / 3_600_000;

  if (hoursUntil >= policy.freeCancelHours) {
    return { tier: "free", refundRatio: 1 };
  }
  if (hoursUntil <= policy.noCancelHours) {
    return { tier: "blocked", refundRatio: 0 };
  }
  // Prorated: linear interpolation across the window between noCancelHours and freeCancelHours
  const window = policy.freeCancelHours - policy.noCancelHours;
  const ratio = (hoursUntil - policy.noCancelHours) / window;
  return { tier: "prorated", refundRatio: Math.round(ratio * 10000) / 10000 };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CancelBookingRequest;
  const { bookingId, choice } = body;

  if (!bookingId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const bookingRef = adminDb.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();

  if (!bookingSnap.exists) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const booking = bookingSnap.data()!;

  if (booking.userId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 409 });
  }

  const checkoutType    = booking.checkout_type    as string | undefined;
  const paymentStatusV2 = booking.payment_status_v2 as string | undefined;

  // slot_held P2P: no payment was made, just release the slot immediately.
  if (booking.status === "slot_held" && checkoutType === "P2P_AI") {
    await bookingRef.update({ status: "cancelled", cancelled_at: FieldValue.serverTimestamp() });
    return NextResponse.json(
      { ...NO_PAYMENT_CANCEL_RESPONSE, currency: (booking.currency as string) ?? "PHP" },
    );
  }

  // pending_cash PAY_AT_VENUE: cash was never collected, just cancel.
  if (paymentStatusV2 === "pending_cash" && checkoutType === "PAY_AT_VENUE") {
    await bookingRef.update({ status: "cancelled", cancelled_at: FieldValue.serverTimestamp() });
    return NextResponse.json(
      { ...NO_PAYMENT_CANCEL_RESPONSE, currency: (booking.currency as string) ?? "PHP" },
    );
  }

  // Confirmed bookings (instant-confirm or P2P paid): validate choice and apply policy.
  if (choice !== "credit" && choice !== "refund_pending") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Load cancellation policy from business (fall back to defaults)
  const bizSnap = await adminDb.collection("businesses").doc(booking.businessSlug).get();
  const bizData = bizSnap.data() ?? {};
  const policy: CancellationPolicy = {
    freeCancelHours:
      bizData.cancellationPolicy?.freeCancelHours ?? DEFAULT_CANCELLATION_POLICY.freeCancelHours,
    noCancelHours:
      bizData.cancellationPolicy?.noCancelHours ?? DEFAULT_CANCELLATION_POLICY.noCancelHours,
    creditValidityDays:
      bizData.cancellationPolicy?.creditValidityDays ?? DEFAULT_CANCELLATION_POLICY.creditValidityDays,
  };

  const bookingStartMs = getBookingStartMs(booking.date as string, (booking.hours as number[])[0]);
  const { tier, refundRatio } = computeTier(bookingStartMs, policy);

  if (tier === "blocked") {
    return NextResponse.json(
      { error: "CANCEL_BLOCKED", tier: "blocked" },
      { status: 422 },
    );
  }

  const creditAmount = Math.round(booking.totalPrice * refundRatio * 100) / 100;

  const batch = adminDb.batch();

  batch.update(bookingRef, {
    status: "cancelled",
    paymentStatus: choice === "credit" ? "credited" : "refund_pending",
  });

  if (choice === "credit" && creditAmount > 0) {
    const expiresAt = Timestamp.fromMillis(
      Date.now() + policy.creditValidityDays * 86_400_000,
    );
    const creditRef = adminDb.collection("credits").doc();
    batch.set(creditRef, {
      userId: uid,
      businessSlug: booking.businessSlug,
      businessName: booking.businessName,
      amount: creditAmount,
      currency: booking.currency,
      type: "issued",
      reason: "cancellation",
      sourceBookingId: bookingId,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  // Fire-and-forget — cancellation is already committed
  const creditExpiresAt =
    choice === "credit" && creditAmount > 0
      ? new Date(Date.now() + policy.creditValidityDays * 86_400_000)
      : undefined;

  const receiptData = {
    customerEmail: booking.userEmail as string,
    customerName: booking.userName as string,
    bookingId,
    businessName: booking.businessName as string,
    businessEmail: (bizData.email as string) ?? "",
    facilityName: booking.facilityName as string,
    date: booking.date as string,
    hours: booking.hours as number[],
    totalPrice: booking.totalPrice as number,
    currency: booking.currency as string,
    tier,
    creditAmount,
    choice,
    creditExpiresAt,
  };

  Promise.all([
    sendCancellationReceipt(receiptData),
    sendAdminCancellationNotification(receiptData),
  ]).catch((err) => console.error("[api/cancel] notification error:", err));

  const response: CancelBookingResponse = {
    tier,
    refundRatio,
    creditAmount,
    currency: booking.currency as string,
  };
  return NextResponse.json(response, { status: 200 });
}
