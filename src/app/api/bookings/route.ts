import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";
import { getBusinessBySlug } from "@/lib/firebase/businesses";
import { sendBookingConfirmation, sendAdminBookingNotification, sendLowBalanceWarning } from "@/lib/notifications/email";

export const dynamic = "force-dynamic";

// Lazy singleton — only initialised when UPSTASH env vars are present.
// In emulator/test environments the vars are absent, so rate limiting is skipped.
let ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  ratelimit = new Ratelimit({
    redis:   Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    prefix:  "bookit:rl:bookings",
  });
  return ratelimit;
}

export interface CreateBookingRequest {
  facilityId: string;
  date: string;
  hours: number[];
  businessSlug: string;
  creditAmount?: number;
}

async function calcPrice(businessSlug: string, facilityId: string, hours: number[]): Promise<{
  totalPrice: number;
  currency: string;
  facilityName: string;
  businessName: string;
  businessEmail: string;
  businessAddress: string;
} | null> {
  const biz = await getBusinessBySlug(businessSlug);
  if (!biz) return null;
  const facility = biz.facilities.find((f) => f.id === facilityId);
  if (!facility) return null;

  const totalPrice = hours.reduce((sum, h) => {
    const isPrime =
      facility.primePricePerHour != null &&
      facility.primeTimeStart != null &&
      h >= facility.primeTimeStart;
    return sum + (isPrime ? facility.primePricePerHour! : facility.pricePerHour);
  }, 0);

  return {
    totalPrice,
    currency: facility.currency,
    facilityName: facility.name,
    businessName: biz.name,
    businessEmail: biz.email,
    businessAddress: biz.address,
  };
}

export async function POST(req: NextRequest) {
  const rl = getRatelimit();
  if (rl) {
    // x-real-ip is set by Vercel's edge and cannot be spoofed by clients.
    // x-forwarded-for leftmost value is client-controlled, so we avoid it.
    const ip = req.headers.get("x-real-ip") ?? "anonymous";
    try {
      const { success } = await rl.limit(ip);
      if (!success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    } catch (err) {
      // Redis unavailable — fail open so bookings are not blocked by infra issues.
      console.error("[api/bookings] rate-limit check failed:", err);
    }
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  let email: string;
  let displayName: string;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email ?? "";
    displayName = decoded.name ?? email;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreateBookingRequest;
  const { facilityId, date, hours, businessSlug, creditAmount = 0 } = body;

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!facilityId || !date || !Array.isArray(hours) || hours.length === 0 || !businessSlug) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof creditAmount !== "number" || creditAmount < 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (
    hours.length > 24 ||
    hours.some((h) => !Number.isInteger(h) || h < 0 || h > 23)
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const uniqueHours = [...new Set(hours)];

  // Recalculate price server-side from Firestore (source of truth)
  const priceInfo = await calcPrice(businessSlug, facilityId, uniqueHours);
  if (!priceInfo) {
    return NextResponse.json({ error: "Unknown business or facility" }, { status: 400 });
  }

  // SaaS wallet check — payment_mode businesses have a per-booking credit balance.
  // Reject new bookings when the balance has dropped to the suspension threshold.
  const bizDoc = await adminDb.collection("businesses").doc(businessSlug).get();
  const bizData = bizDoc.data() ?? {};
  const paymentMode = bizData.payment_mode as string | undefined;
  const saasBalance = typeof bizData.saas_credit_balance === "number"
    ? bizData.saas_credit_balance
    : undefined;

  if (paymentMode && saasBalance !== undefined && saasBalance <= -5) {
    return NextResponse.json({ error: "SERVICE_SUSPENDED" }, { status: 503 });
  }

  // Clamp creditAmount to totalPrice — can't overpay with credits
  const appliedCredit = Math.min(creditAmount, priceInfo.totalPrice);

  // Verify the user has sufficient credit balance at this business (server-side check)
  if (appliedCredit > 0) {
    const creditsSnap = await adminDb
      .collection("credits")
      .where("userId", "==", uid)
      .where("businessSlug", "==", businessSlug)
      .get();
    const now = Date.now();
    let issued = 0;
    let redeemed = 0;
    for (const doc of creditsSnap.docs) {
      const c = doc.data();
      if (c.type === "issued" && c.expiresAt.toMillis() > now) issued += c.amount as number;
      if (c.type === "redeemed") redeemed += c.amount as number;
    }
    const balance = Math.max(0, Math.round((issued - redeemed) * 100) / 100);
    if (appliedCredit > balance) {
      return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 422 });
    }
  }

  // P2P flow: slot is held pending payment proof; confirmed when proof is approved.
  const isP2P = paymentMode === "MANUAL_AI";
  const bookingStatus = isP2P ? "slot_held" : "confirmed";
  const HOLD_HOURS = 24;
  const heldUntil = isP2P
    ? Timestamp.fromMillis(Date.now() + HOLD_HOURS * 60 * 60 * 1000)
    : null;

  const newDocRef = adminDb.collection("bookings").doc();

  try {
    await adminDb.runTransaction(async (tx) => {
      // Block against both confirmed and slot_held to prevent double-booking while a
      // slot is held awaiting payment proof.
      const snap = await tx.get(
        adminDb
          .collection("bookings")
          .where("businessSlug", "==", businessSlug)
          .where("facilityId", "==", facilityId)
          .where("date", "==", date)
          .where("status", "in", ["confirmed", "slot_held"])
      );

      const takenHours = new Set<number>();
      snap.docs.forEach((d) => {
        (d.data().hours as number[]).forEach((h) => takenHours.add(h));
      });

      if (uniqueHours.some((h) => takenHours.has(h))) {
        throw new Error("SLOT_UNAVAILABLE");
      }

      tx.set(newDocRef, {
        userId: uid,
        userEmail: email,
        userName: displayName,
        businessSlug,
        businessName: priceInfo.businessName,
        facilityId,
        facilityName: priceInfo.facilityName,
        date,
        hours: uniqueHours,
        totalPrice: priceInfo.totalPrice,
        currency: priceInfo.currency,
        status: bookingStatus,
        ...(isP2P && {
          checkout_type: "P2P_AI",
          payment_status_v2: "pending_proof",
          held_until: heldUntil,
        }),
        ...(appliedCredit > 0 && { creditApplied: appliedCredit }),
        createdAt: FieldValue.serverTimestamp(),
      });

      // Deduct one SaaS credit per booking (held or confirmed) for payment_mode businesses.
      if (paymentMode && saasBalance !== undefined) {
        tx.update(adminDb.collection("businesses").doc(businessSlug), {
          saas_credit_balance: FieldValue.increment(-1),
        });
      }

      // Record the credit redemption event inside the same transaction
      if (appliedCredit > 0) {
        const redemptionRef = adminDb.collection("credits").doc();
        tx.set(redemptionRef, {
          userId: uid,
          businessSlug,
          businessName: priceInfo.businessName,
          amount: appliedCredit,
          currency: priceInfo.currency,
          type: "redeemed",
          reason: "cancellation",
          sourceBookingId: newDocRef.id,
          redeemedBookingId: newDocRef.id,
          expiresAt: new Timestamp(0, 0),
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_UNAVAILABLE") {
      return NextResponse.json({ error: "SLOT_UNAVAILABLE" }, { status: 409 });
    }
    console.error("[api/bookings] transaction error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Fire-and-forget low balance warning at exactly 5 or 0 remaining credits.
  if (paymentMode && saasBalance !== undefined) {
    const newBalance = saasBalance - 1;
    if (newBalance === 5 || newBalance === 0) {
      sendLowBalanceWarning({
        businessEmail: bizData.email as string ?? "",
        businessName: priceInfo.businessName,
        businessSlug,
        balance: newBalance,
      }).catch((err) => console.error("[api/bookings] low balance warning error:", err));
    }
  }

  // Confirmation emails only after instant-confirm (slot_held bookings are not confirmed yet).
  if (!isP2P) {
    const notificationData = {
      customerEmail: email,
      customerName: displayName,
      bookingId: newDocRef.id,
      businessName: priceInfo.businessName,
      businessEmail: priceInfo.businessEmail,
      businessAddress: priceInfo.businessAddress,
      facilityName: priceInfo.facilityName,
      date,
      hours: uniqueHours,
      totalPrice: priceInfo.totalPrice,
      currency: priceInfo.currency,
      ...(appliedCredit > 0 && { creditApplied: appliedCredit }),
    };
    Promise.all([
      sendBookingConfirmation(notificationData),
      sendAdminBookingNotification(notificationData),
    ]).catch((err) => console.error("[api/bookings] notification error:", err));
  }

  return NextResponse.json(
    {
      bookingId: newDocRef.id,
      creditApplied: appliedCredit > 0 ? appliedCredit : undefined,
      ...(isP2P && { checkout_type: "P2P_AI", static_qr_url: (bizData.static_qr_url as string | null) ?? null }),
    },
    { status: 201 },
  );
}
