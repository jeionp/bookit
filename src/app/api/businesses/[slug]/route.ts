import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Auth check
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

  // Admin slug check
  const adminDoc = await adminDb.collection("admins").doc(uid).get();
  const slugs: string[] = adminDoc.exists ? (adminDoc.data()?.slugs ?? []) : [];
  if (!slugs.includes(slug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only allow editable business fields. Excludes slug (immutable identifier),
  // type (structural — changing would break routing), and rating/reviewCount
  // (should only be updated through a controlled review system, not the settings UI).
  const ALLOWED_FIELDS = new Set([
    "name", "tagline", "description", "coverImage", "location",
    "address", "phone", "email", "accentColor",
    "facilities", "amenities", "operatingHours",
    "accepts_qr", "accepts_cash", "static_qr_url",
  ]);

  const raw = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (ALLOWED_FIELDS.has(key)) patch[key] = raw[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await adminDb.collection("businesses").doc(slug).set(patch, { merge: true });

  return NextResponse.json({ ok: true });
}
