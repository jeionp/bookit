import Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin-app";
import {
  sendBookingConfirmation,
  sendAdminBookingNotification,
  sendPaymentRejected,
} from "@/lib/notifications/email";
import { deductSaasCredit } from "./ledger";

const ALLOWED_PROOF_HOSTNAMES = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);

let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

export async function verifyPaymentProof(bookingId: string): Promise<void> {
  const bookingRef = adminDb.collection("bookings").doc(bookingId);
  const snap = await bookingRef.get();
  if (!snap.exists) return;
  const booking = snap.data()!;

  if (booking.payment_status_v2 !== "ai_review") return;

  const proofUrl = booking.proof_url as string;

  // Only fetch from known Firebase Storage domains to prevent SSRF.
  let hostname: string;
  try {
    hostname = new URL(proofUrl).hostname;
  } catch {
    console.error("[verify-proof] invalid proof_url format:", proofUrl);
    return;
  }
  if (!ALLOWED_PROOF_HOSTNAMES.has(hostname)) {
    console.error("[verify-proof] blocked disallowed hostname:", hostname);
    return;
  }

  // Fetch the receipt image.
  let imageBase64: string;
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  try {
    const res = await fetch(proofUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    imageBase64 = Buffer.from(buffer).toString("base64");
    const ct = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    mediaType = (ALLOWED_TYPES.includes(ct as typeof ALLOWED_TYPES[number]) ? ct : "image/jpeg") as typeof mediaType;
  } catch (err) {
    console.error("[verify-proof] failed to fetch proof image:", err);
    return;
  }

  // Ask Claude Haiku to extract the payment amount from the receipt.
  let extractedAmount: number | null = null;
  try {
    const message = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: 'Extract the total payment amount from this GCash receipt. Respond with JSON only, no markdown: {"amount": <number>} or {"amount": null} if not found.',
          },
        ],
      }],
    });
    const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    const parsed = JSON.parse(text) as { amount: unknown };
    extractedAmount = typeof parsed.amount === "number" ? parsed.amount : null;
  } catch (err) {
    // Graceful fallback: leave at ai_review so admin can retry or review manually.
    console.error("[verify-proof] Claude API error — leaving at ai_review:", err);
    return;
  }

  const totalPrice = booking.totalPrice as number;
  const isMatch = extractedAmount !== null && Math.abs(extractedAmount - totalPrice) < 0.01;

  if (isMatch) {
    await bookingRef.update({
      payment_status_v2: "paid",
      status: "confirmed",
      verified_at: FieldValue.serverTimestamp(),
    });

    const bizRef = adminDb.collection("businesses").doc(booking.businessSlug as string);
    const bizSnap = await bizRef.get();
    const biz = bizSnap.data() ?? {};

    await deductSaasCredit({
      businessSlug: booking.businessSlug as string,
      bookingId,
      trigger: "ai_verify",
      biz,
    });

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
    ]).catch((err) => console.error("[verify-proof] confirmation email error:", err));
  } else {
    await bookingRef.update({
      payment_status_v2: "rejected",
      rejected_amount: extractedAmount,
    });

    sendPaymentRejected({
      customerEmail: booking.userEmail    as string,
      customerName:  booking.userName     as string,
      bookingId,
      businessName:  booking.businessName as string,
      facilityName:  booking.facilityName as string,
      date:          booking.date         as string,
      hours:         booking.hours        as number[],
      totalPrice:    booking.totalPrice   as number,
      currency:      booking.currency     as string,
      submittedAmount: extractedAmount,
    }).catch((err) => console.error("[verify-proof] rejection email error:", err));
  }
}
