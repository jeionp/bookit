import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";
import { requireAdminOf } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const uidOrRes = await requireAdminOf(req, slug);
  if (uidOrRes instanceof NextResponse) return uidOrRes;

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
