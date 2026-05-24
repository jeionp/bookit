import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";
import { requireUser } from "@/lib/api/auth";
import { requireString } from "@/lib/api/validation";
import { verifyPaymentProof } from "@/lib/payments/verify-proof";

export const dynamic = "force-dynamic";

// Proof images must come from Firebase Storage — prevents SSRF when Phase 4 fetches for OCR.
const ALLOWED_PROOF_HOSTNAMES = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);

const GUARD_NOT_FOUND      = "GUARD_NOT_FOUND";
const GUARD_FORBIDDEN      = "GUARD_FORBIDDEN";
const GUARD_WRONG_TYPE     = "GUARD_WRONG_TYPE";
const GUARD_SLOT_NOT_HELD  = "GUARD_SLOT_NOT_HELD";
const GUARD_PROOF_SUBMITTED = "GUARD_PROOF_SUBMITTED";

export async function POST(req: NextRequest) {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const uid = tokenOrRes.uid;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const bookingId = requireString(body.bookingId);
  const proofUrl  = requireString(body.proofUrl);
  if (!bookingId || !proofUrl) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let parsedProofUrl: URL;
  try {
    parsedProofUrl = new URL(proofUrl);
  } catch {
    return NextResponse.json({ error: "Invalid proofUrl" }, { status: 400 });
  }
  if (!ALLOWED_PROOF_HOSTNAMES.has(parsedProofUrl.hostname)) {
    return NextResponse.json({ error: "Invalid proofUrl" }, { status: 400 });
  }
  // Ensure the URL path contains this booking's ID — prevents cross-booking proof reuse.
  const decodedPath = decodeURIComponent(parsedProofUrl.pathname);
  if (!decodedPath.includes(`payment_proofs/${bookingId}/`)) {
    return NextResponse.json({ error: "Invalid proofUrl" }, { status: 400 });
  }

  const bookingRef = adminDb.collection("bookings").doc(bookingId);

  // Wrap read+write in a transaction to prevent concurrent double-submissions
  // seeing the same pending_proof state and both writing ai_review.
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) throw new Error(GUARD_NOT_FOUND);
      const booking = snap.data()!;
      if (booking.userId !== uid)               throw new Error(GUARD_FORBIDDEN);
      if (booking.checkout_type !== "P2P_AI")   throw new Error(GUARD_WRONG_TYPE);
      if (booking.status !== "slot_held")        throw new Error(GUARD_SLOT_NOT_HELD);
      if (booking.payment_status_v2 !== "pending_proof") throw new Error(GUARD_PROOF_SUBMITTED);
      tx.update(bookingRef, { payment_status_v2: "ai_review", proof_url: proofUrl });
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === GUARD_NOT_FOUND)      return NextResponse.json({ error: "Not found" },              { status: 404 });
      if (err.message === GUARD_FORBIDDEN)       return NextResponse.json({ error: "Forbidden" },             { status: 403 });
      if (err.message === GUARD_WRONG_TYPE)      return NextResponse.json({ error: "Invalid booking type" },  { status: 400 });
      if (err.message === GUARD_SLOT_NOT_HELD)   return NextResponse.json({ error: "Proof already submitted" }, { status: 409 });
      if (err.message === GUARD_PROOF_SUBMITTED) return NextResponse.json({ error: "Proof already submitted" }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  verifyPaymentProof(bookingId).catch((err) =>
    console.error("[submit-proof] verify error:", err)
  );

  return NextResponse.json({ success: true });
}
