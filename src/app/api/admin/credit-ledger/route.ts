import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const limitParam = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = isNaN(limitParam) || limitParam < 1 || limitParam > 200 ? 50 : limitParam;

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const adminDoc = await adminDb.collection("admins").doc(uid).get();
  const slugs: string[] = adminDoc.exists ? (adminDoc.data()?.slugs ?? []) : [];
  if (!slugs.includes(slug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snap = await adminDb
    .collection("businesses")
    .doc(slug)
    .collection("credit_ledger")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const entries = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      businessSlug: (data.businessSlug as string) ?? slug,
      bookingId: (data.bookingId as string) ?? "",
      trigger: (data.trigger as string) ?? "",
      balanceBefore: (data.balanceBefore as number) ?? 0,
      balanceAfter: (data.balanceAfter as number) ?? 0,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ entries });
}
