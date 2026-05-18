import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";
import { FieldValue } from "firebase-admin/firestore";
import { isValidSlug } from "@/lib/slugify";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["court", "appointment", "room"] as const;

const STRING_LIMITS: Record<string, number> = {
  name: 100,
  tagline: 200,
  description: 1000,
  location: 200,
  address: 300,
  phone: 30,
  email: 100,
  accentColor: 20,
};

function validateFacilities(facilities: unknown): string | null {
  if (!Array.isArray(facilities)) return "facilities must be an array";
  if (facilities.length > 10) return "facilities must have at most 10 items";
  for (const f of facilities) {
    if (!f || typeof f !== "object") return "Invalid facility item";
    const facility = f as Record<string, unknown>;
    if (!facility.id || typeof facility.id !== "string") return "Facility id is required";
    if (!facility.name || typeof facility.name !== "string" || facility.name.length > 100)
      return "Facility name is required and must be under 100 characters";
    if (typeof facility.description === "string" && facility.description.length > 500)
      return "Facility description must be under 500 characters";
    const price = facility.pricePerHour;
    if (typeof price !== "number" || price < 0 || price > 99999)
      return "Facility pricePerHour must be a number between 0 and 99999";
    if (facility.primePricePerHour !== undefined) {
      const primePrice = facility.primePricePerHour;
      if (typeof primePrice !== "number" || primePrice < 0 || primePrice > 99999)
        return "Facility primePricePerHour must be a number between 0 and 99999";
    }
    if (facility.currency !== undefined) {
      if (typeof facility.currency !== "string" || facility.currency.length > 10)
        return "Invalid facility currency";
    }
  }
  return null;
}

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
  const {
    slug, name, type, tagline, description, coverImage, location, address, phone, email,
    accentColor, facilities, amenities, operatingHours,
    accepts_qr, accepts_cash, accepts_gateway,
  } = body;

  if (!slug || !isValidSlug(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Validate string field lengths
  for (const [field, limit] of Object.entries(STRING_LIMITS)) {
    const val = body[field];
    if (val !== undefined && (typeof val !== "string" || val.length > limit)) {
      return NextResponse.json(
        { error: `${field} must be a string under ${limit} characters` },
        { status: 400 },
      );
    }
  }

  // Validate business type
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid business type" }, { status: 400 });
  }

  // Validate facilities array
  if (facilities !== undefined) {
    const err = validateFacilities(facilities);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  // Validate amenities array
  if (amenities !== undefined) {
    if (!Array.isArray(amenities) || amenities.length > 50) {
      return NextResponse.json({ error: "amenities must be an array of at most 50 items" }, { status: 400 });
    }
    if (amenities.some((a) => typeof a !== "string" || a.length > 100)) {
      return NextResponse.json({ error: "Each amenity must be a string under 100 characters" }, { status: 400 });
    }
  }

  // Re-check availability before writing.
  // Allow overwriting our own onboarding_reserved placeholder (normal completion path).
  const existing = await adminDb.collection("businesses").doc(slug).get();
  if (existing.exists) {
    const data = existing.data()!;
    if (data.status !== "onboarding_reserved" || data.reservedBy !== uid) {
      return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    }
  }

  const batch = adminDb.batch();

  batch.set(adminDb.collection("businesses").doc(slug), {
    slug,
    name: name.trim(),
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
    { merge: true },
  );

  await batch.commit();

  return NextResponse.json({ ok: true, slug });
}
