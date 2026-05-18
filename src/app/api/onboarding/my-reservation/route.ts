import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace("Bearer ", "");
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
