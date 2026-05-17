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

  // Guard against empty or obviously invalid booking IDs before hitting Firestore
  if (!bookingId || bookingId.trim() === "") {
    return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
  }

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

  if (action === "approve") {
    // Use a transaction to prevent TOCTOU: two concurrent approve calls must not
    // both succeed. The transaction re-reads the document inside the atomic unit
    // and aborts if the state has already changed.
    let approvedBooking: Record<string, unknown> | null = null;
    try {
      await adminDb.runTransaction(async (tx) => {
        const txSnap = await tx.get(bookingRef);
        if (!txSnap.exists) throw new Error("NOT_FOUND");
        const data = txSnap.data()!;
        if ((data.payment_status_v2 as string | undefined) !== "ai_review") {
          throw new Error("WRONG_STATE");
        }
        tx.update(bookingRef, {
          payment_status_v2: "paid",
          status: "confirmed",
          verified_at: FieldValue.serverTimestamp(),
        });
        approvedBooking = data as Record<string, unknown>;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (err instanceof Error && err.message === "WRONG_STATE") {
        return NextResponse.json({ error: "Booking is not in ai_review state" }, { status: 409 });
      }
      console.error("[payment-status] approve transaction error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const data = approvedBooking!;
    const bizSnap = await adminDb.collection("businesses").doc(data.businessSlug as string).get();
    const biz = bizSnap.data() ?? {};
    const notificationData = {
      customerEmail:   data.userEmail    as string,
      customerName:    data.userName     as string,
      bookingId,
      businessName:    data.businessName as string,
      businessEmail:   (biz.email    as string) ?? "",
      businessAddress: (biz.address  as string) ?? "",
      facilityName:    data.facilityName as string,
      date:            data.date         as string,
      hours:           data.hours        as number[],
      totalPrice:      data.totalPrice   as number,
      currency:        data.currency     as string,
      ...(data.creditApplied != null && { creditApplied: data.creditApplied as number }),
    };
    Promise.all([
      sendBookingConfirmation(notificationData),
      sendAdminBookingNotification(notificationData),
    ]).catch((err) => console.error("[payment-status] approval email error:", err));
    return NextResponse.json({ ok: true });
  }

  const paymentStatus = booking.payment_status_v2 as string | undefined;
  const checkoutType  = booking.checkout_type  as string | undefined;

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
