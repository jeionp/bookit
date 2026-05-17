import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";
import { sendBookingConfirmation, sendAdminBookingNotification } from "@/lib/notifications/email";

export const dynamic = "force-dynamic";

type Action = "approve" | "reject" | "mark_paid";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId } = await params;

  let action: Action;
  try {
    const body = (await req.json()) as { action: unknown };
    if (body.action !== "approve" && body.action !== "reject" && body.action !== "mark_paid") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    action = body.action;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const bookingRef = adminDb.collection("bookings").doc(bookingId);
  const snap = await bookingRef.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const booking = snap.data()!;

  const adminDoc = await adminDb.collection("admins").doc(uid).get();
  const slugs: string[] = adminDoc.exists ? (adminDoc.data()?.slugs ?? []) : [];
  if (!slugs.includes(booking.businessSlug as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paymentStatus = booking.payment_status_v2 as string | undefined;
  const checkoutType  = booking.checkout_type  as string | undefined;

  if (action === "approve") {
    if (paymentStatus !== "ai_review") {
      return NextResponse.json({ error: "Booking is not in ai_review state" }, { status: 409 });
    }
    await bookingRef.update({
      payment_status_v2: "paid",
      status: "confirmed",
      verified_at: FieldValue.serverTimestamp(),
    });
    const bizSnap = await adminDb.collection("businesses").doc(booking.businessSlug as string).get();
    const biz = bizSnap.data() ?? {};
    const notificationData = {
      customerEmail:   booking.userEmail    as string,
      customerName:    booking.userName     as string,
      bookingId,
      businessName:    booking.businessName as string,
      businessEmail:   (biz.email    as string) ?? "",
      businessAddress: (biz.address  as string) ?? "",
      facilityName:    booking.facilityName as string,
      date:            booking.date         as string,
      hours:           booking.hours        as number[],
      totalPrice:      booking.totalPrice   as number,
      currency:        booking.currency     as string,
      ...(booking.creditApplied != null && { creditApplied: booking.creditApplied as number }),
    };
    Promise.all([
      sendBookingConfirmation(notificationData),
      sendAdminBookingNotification(notificationData),
    ]).catch((err) => console.error("[payment-status] approval email error:", err));
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    if (paymentStatus !== "ai_review" && paymentStatus !== "pending_proof") {
      return NextResponse.json({ error: "Booking cannot be rejected in its current state" }, { status: 409 });
    }
    await bookingRef.update({ payment_status_v2: "rejected" });
    return NextResponse.json({ ok: true });
  }

  // mark_paid
  if (checkoutType !== "PAY_AT_VENUE" || paymentStatus !== "pending_cash") {
    return NextResponse.json({ error: "Booking is not a pending cash payment" }, { status: 409 });
  }
  await bookingRef.update({
    payment_status_v2: "paid",
    paid_at: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}
