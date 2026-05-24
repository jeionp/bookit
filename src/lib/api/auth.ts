import { NextRequest, NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";
import { COLL } from "@/lib/api/constants";

export async function requireUser(req: NextRequest): Promise<DecodedIdToken | NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function isAdminOf(uid: string, slug: string): Promise<boolean> {
  const adminDoc = await adminDb.collection(COLL.ADMINS).doc(uid).get();
  const slugs: string[] = adminDoc.exists ? (adminDoc.data()?.slugs ?? []) : [];
  return slugs.includes(slug);
}

export async function requireAdminOf(req: NextRequest, slug: string): Promise<string | NextResponse> {
  const result = await requireUser(req);
  if (result instanceof NextResponse) return result;
  if (!(await isAdminOf(result.uid, slug))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result.uid;
}
