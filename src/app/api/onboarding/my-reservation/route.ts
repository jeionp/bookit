import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";
import { requireUser } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const uid = tokenOrRes.uid;

  const adminDoc = await adminDb.collection("admins").doc(uid).get();
  const slugs: string[] = adminDoc.data()?.slugs ?? [];

  for (const slug of slugs) {
    const bizDoc = await adminDb.collection("businesses").doc(slug).get();
    const data = bizDoc.data();
    if (bizDoc.exists && data?.status === "onboarding_reserved" && data?.reservedBy === uid) {
      return NextResponse.json({ slug });
    }
  }

  return NextResponse.json({ slug: null });
}
