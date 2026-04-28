import { NextRequest, NextResponse } from "next/server";

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
  const body = (await req.json()) as RefundRequest;
  console.log("[api/refund] stub called:", body);
  return NextResponse.json({ ok: true, stub: true });
}
