import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";
import { createGateway } from "@/lib/payments/gateway";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  let bookingId: string;
  try {
    const body = (await req.json()) as { bookingId?: unknown };
    if (!body.bookingId || typeof body.bookingId !== "string" || body.bookingId.trim() === "") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    bookingId = body.bookingId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const snap = await adminDb.collection("bookings").doc(bookingId).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const booking = snap.data()!;

  if (booking.userId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (booking.checkout_type !== "GATEWAY_SPLIT") {
    return NextResponse.json({ error: "Not a gateway booking" }, { status: 400 });
  }
  if (booking.payment_status_v2 !== "pending_gateway") {
    return NextResponse.json({ error: "Booking is not awaiting gateway payment" }, { status: 409 });
  }

  // Use a trusted base URL from env, never from the Host header (open-redirect risk).
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const successUrl = `${base}/${booking.businessSlug as string}?payment=success&bookingId=${bookingId}`;
  const cancelUrl  = `${base}/${booking.businessSlug as string}?payment=cancelled&bookingId=${bookingId}`;

  const gateway = createGateway();
  let session: { checkoutUrl: string; sessionId: string };
  try {
    session = await gateway.createSession({
      bookingId,
      amountCents: Math.round((booking.totalPrice as number) * 100),
      currency: booking.currency as string,
      description: `${booking.facilityName as string} @ ${booking.businessName as string} on ${booking.date as string}`,
      metadata: {
        bookingId,
        businessSlug: booking.businessSlug as string,
        userId: uid,
      },
      successUrl,
      cancelUrl,
    });
  } catch (err) {
    console.error("[create-session] gateway error:", err);
    return NextResponse.json({ error: "Payment gateway error" }, { status: 502 });
  }

  await adminDb.collection("bookings").doc(bookingId).update({
    gateway_session_id: session.sessionId,
  });

  return NextResponse.json({ checkoutUrl: session.checkoutUrl, sessionId: session.sessionId });
}
