import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";
import { FieldValue } from "firebase-admin/firestore";
import { isValidSlug } from "@/lib/slugify";

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

  const body = await req.json();
  const { slug, name, type, tagline, description, coverImage, location, address, phone, email,
    accentColor, facilities, amenities, operatingHours,
    accepts_qr, accepts_cash, accepts_gateway } = body;

  if (!slug || !isValidSlug(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Re-check availability atomically before writing
  const existing = await adminDb.collection("businesses").doc(slug).get();
  if (existing.exists) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }

  const batch = adminDb.batch();

  batch.set(adminDb.collection("businesses").doc(slug), {
    slug,
    name,
    type: type ?? "court",
    tagline: tagline ?? "",
    description: description ?? "",
    coverImage: coverImage ?? "",
    location: location ?? "",
    address: address ?? "",
    phone: phone ?? "",
    email: email ?? "",
    accentColor: accentColor ?? "#3B82F6",
    rating: 0,
    reviewCount: 0,
    facilities: facilities ?? [],
    amenities: amenities ?? [],
    operatingHours: operatingHours ?? [],
    accepts_qr: accepts_qr === true,
    accepts_cash: accepts_cash === true,
    accepts_gateway: accepts_gateway === true,
    ownerId: uid,
    status: "active",
  });

  batch.set(
    adminDb.collection("admins").doc(uid),
    { slugs: FieldValue.arrayUnion(slug) },
    { merge: true }
  );

  await batch.commit();

  return NextResponse.json({ ok: true, slug });
}
