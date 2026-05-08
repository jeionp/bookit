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

  const { creditId } = (await req.json()) as { creditId: string };
  if (!creditId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const creditSnap = await adminDb.collection("credits").doc(creditId).get();
  if (!creditSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const credit = creditSnap.data()!;

  // Verify caller is an admin of the business that issued this credit
  const adminSnap = await adminDb.collection("admins").doc(uid).get();
  const slugs: string[] = adminSnap.exists ? (adminSnap.data()?.slugs ?? []) : [];
  if (!slugs.includes(credit.businessSlug as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await adminDb.collection("credits").doc(creditId).update({ voided: true });
  return NextResponse.json({ ok: true });
}
