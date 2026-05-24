import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin-app";
import { sendConfirmationEmails } from "@/lib/notifications/email";
import { deductSaasCredit } from "./ledger";
import type { WebhookEvent } from "./gateway";

export interface WebhookResult {
  ok: boolean;
  error?: string;
  status?: number;
}

export async function processWebhookEvent(event: WebhookEvent): Promise<WebhookResult> {
  const bookingRef = adminDb.collection("bookings").doc(event.bookingId);

  if (event.type === "payment.succeeded") {
    let confirmedBooking: Record<string, unknown> | null = null;
    try {
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists) throw new Error("NOT_FOUND");
        const data = snap.data()!;
        // WRONG_STATE covers both "already confirmed" (idempotent re-delivery) and
        // "wrong checkout_type" (should never happen via real webhook).
        if (data.payment_status_v2 !== "pending_gateway") throw new Error("WRONG_STATE");
        tx.update(bookingRef, {
          payment_status_v2: "paid",
          status: "confirmed",
          confirmed_at: FieldValue.serverTimestamp(),
        });
        confirmedBooking = data as Record<string, unknown>;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "NOT_FOUND") {
        return { ok: false, error: "Booking not found", status: 404 };
      }
      if (err instanceof Error && err.message === "WRONG_STATE") {
        return { ok: true }; // idempotent — duplicate delivery
      }
      throw err;
    }

    const data = confirmedBooking!;
    const bizSnap = await adminDb.collection("businesses").doc(data.businessSlug as string).get();
    const biz = bizSnap.data() ?? {};

    await deductSaasCredit({
      businessSlug: data.businessSlug as string,
      bookingId: event.bookingId,
      trigger: "gateway_webhook",
      biz,
    });

    const notificationData = {
      customerEmail: data.userEmail as string,
      customerName: data.userName as string,
      bookingId: event.bookingId,
      businessName: data.businessName as string,
      businessEmail: (biz.email as string) ?? "",
      businessAddress: (biz.address as string) ?? "",
      facilityName: data.facilityName as string,
      date: data.date as string,
      hours: data.hours as number[],
      totalPrice: data.totalPrice as number,
      currency: data.currency as string,
      ...(data.creditApplied != null && { creditApplied: data.creditApplied as number }),
    };
    sendConfirmationEmails(notificationData, "process-webhook");

    return { ok: true };
  }

  // payment.failed or payment.expired — release the slot immediately so other players can book
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) throw new Error("NOT_FOUND");
      const data = snap.data()!;
      if (data.payment_status_v2 !== "pending_gateway") throw new Error("WRONG_STATE");
      tx.update(bookingRef, {
        payment_status_v2: "rejected",
        status: "expired",
      });
    });
  } catch (err) {
    // Both cases are fine to ack — booking is already gone or already transitioned
    if (err instanceof Error && (err.message === "WRONG_STATE" || err.message === "NOT_FOUND")) {
      return { ok: true };
    }
    throw err;
  }

  return { ok: true };
}
