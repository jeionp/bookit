import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";

export const dynamic = "force-dynamic";

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

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { bookingId, proofUrl } = body;

  if (!bookingId || typeof bookingId !== "string" || !proofUrl || typeof proofUrl !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const bookingRef = adminDb.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();

  if (!bookingSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const booking = bookingSnap.data()!;

  if (booking.userId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (booking.checkout_type !== "P2P_AI") {
    return NextResponse.json({ error: "Invalid booking type" }, { status: 400 });
  }
  if (booking.payment_status_v2 !== "pending_proof") {
    return NextResponse.json({ error: "Proof already submitted" }, { status: 409 });
  }

  await bookingRef.update({
    payment_status_v2: "ai_review",
    proof_url: proofUrl,
  });

  return NextResponse.json({ success: true });
}
