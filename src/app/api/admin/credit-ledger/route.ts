import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";
import { requireUser, isAdminOf } from "@/lib/api/auth";
import { parseLimit } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const uid = tokenOrRes.uid;

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const limit = parseLimit(searchParams.get("limit"), 50);

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  if (!(await isAdminOf(uid, slug))) {
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
