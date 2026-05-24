import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";
import { requireUser, isAdminOf } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const uid = tokenOrRes.uid;

  const { creditId } = (await req.json()) as { creditId: string };
  if (!creditId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const creditSnap = await adminDb.collection("credits").doc(creditId).get();
  if (!creditSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const credit = creditSnap.data()!;

  if (!(await isAdminOf(uid, credit.businessSlug as string))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await adminDb.collection("credits").doc(creditId).update({ voided: true });
  return NextResponse.json({ ok: true });
}
