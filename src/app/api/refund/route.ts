import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";

export interface RefundRequest {
  bookingId:    string;
  businessSlug: string;
  method:       "refund" | "credit";
  amountCents:  number;
}

// TODO: replace stub with real PayMongo call or credit ledger write.
// For "refund": POST to PayMongo /v1/refunds with the payment intent ID.
// For "credit": write to /customers/{userEmail}/credits in Firestore via Admin SDK.
// Both require businessSlug to look up the per-business PayMongo secret key.
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

  const body = (await req.json()) as RefundRequest;
  const { bookingId, businessSlug, method, amountCents } = body;

  if (!bookingId || !businessSlug || !method || typeof amountCents !== "number") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const adminDoc = await adminDb.collection("admins").doc(uid).get();
  const slugs: string[] = adminDoc.exists ? (adminDoc.data()?.slugs ?? []) : [];
  if (!slugs.includes(businessSlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  console.log("[api/refund] stub called:", body);
  return NextResponse.json({ ok: true, stub: true });
}
