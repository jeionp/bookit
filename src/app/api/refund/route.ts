import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin-app";
import { requireUser, isAdminOf } from "@/lib/api/auth";
import { createGateway } from "@/lib/payments/gateway";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/types";

export interface RefundRequest {
  bookingId:    string;
  businessSlug: string;
  method:       "refund" | "credit";
  amountCents:  number;
}

export async function POST(req: NextRequest) {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const uid = tokenOrRes.uid;

  const body = (await req.json()) as RefundRequest;
  const { bookingId, businessSlug, method, amountCents } = body;

  if (!bookingId || !businessSlug || (method !== "refund" && method !== "credit")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof amountCents !== "number" || amountCents <= 0 || amountCents > 10_000_000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  if (!(await isAdminOf(uid, businessSlug))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bookingSnap = await adminDb.collection("bookings").doc(bookingId).get();
  if (!bookingSnap.exists) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  const booking = bookingSnap.data()!;

  // Verify the booking belongs to the admin's business (prevents cross-tenant refund)
  if (booking.businessSlug !== businessSlug) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (method === "credit") {
    const bizSnap = await adminDb.collection("businesses").doc(businessSlug).get();
    const bizData = bizSnap.data() ?? {};
    const validityDays =
      bizData.cancellationPolicy?.creditValidityDays ??
      DEFAULT_CANCELLATION_POLICY.creditValidityDays;

    const creditAmount = Math.round(amountCents) / 100;
    const expiresAt = Timestamp.fromMillis(Date.now() + validityDays * 86_400_000);

    const batch = adminDb.batch();
    batch.set(adminDb.collection("credits").doc(), {
      userId: booking.userId,
      businessSlug,
      businessName: (booking.businessName as string) ?? "",
      amount: creditAmount,
      currency: (booking.currency as string) ?? "PHP",
      type: "issued",
      reason: "admin_credit",
      sourceBookingId: bookingId,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.update(adminDb.collection("bookings").doc(bookingId), {
      paymentStatus: "credited",
    });
    await batch.commit();

    return NextResponse.json({ ok: true, creditAmount });
  }

  // method === "refund" — requires a gateway session on the booking
  const sessionId = booking.gateway_session_id as string | undefined;
  if (!sessionId) {
    return NextResponse.json(
      { error: "No gateway session on this booking — use method:credit instead" },
      { status: 422 },
    );
  }

  const gateway = createGateway();
  let result: { refundId: string; status: "pending" | "succeeded" | "failed" };
  try {
    result = await gateway.issueRefund({
      sessionId,
      amountCents,
      reason: "Admin-initiated refund",
    });
  } catch (err) {
    console.error("[api/refund] gateway error:", err);
    return NextResponse.json({ error: "Payment gateway error" }, { status: 502 });
  }

  if (result.status === "failed") {
    return NextResponse.json(
      { error: "Refund failed at payment gateway", refundId: result.refundId },
      { status: 502 },
    );
  }

  const newPaymentStatus = result.status === "succeeded" ? "refunded" : "refund_pending";
  await adminDb.collection("bookings").doc(bookingId).update({
    paymentStatus: newPaymentStatus,
    payment_status_v2: newPaymentStatus,
    refund_id: result.refundId,
  });

  return NextResponse.json({ ok: true, refundId: result.refundId, status: result.status });
}
