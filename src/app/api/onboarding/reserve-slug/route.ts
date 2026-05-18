import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";
import { FieldValue } from "firebase-admin/firestore";
import { isValidSlug } from "@/lib/slugify";

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({}));
  const { slug, releaseSlug } = body as { slug?: string; releaseSlug?: string };

  if (!slug || !isValidSlug(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  try {
    await adminDb.runTransaction(async (t) => {
      const bizRef = adminDb.collection("businesses").doc(slug);
      const adminRef = adminDb.collection("admins").doc(uid);
      const releaseRef =
        releaseSlug && releaseSlug !== slug
          ? adminDb.collection("businesses").doc(releaseSlug)
          : null;

      // Reads first (required before any writes in a transaction)
      const reads = [t.get(bizRef), t.get(adminRef)] as const;
      const releaseRead = releaseRef ? t.get(releaseRef) : Promise.resolve(null);
      const [[bizDoc, adminDoc], releaseDoc] = await Promise.all([
        Promise.all(reads),
        releaseRead,
      ]);

      // Validate: if slug is already taken by another user/business, reject
      if (bizDoc.exists) {
        const data = bizDoc.data()!;
        if (data.status !== "onboarding_reserved" || data.reservedBy !== uid) {
          throw new Error("Slug already taken");
        }
        // Own reservation — update timestamp below (idempotent re-reserve)
      }

      // Compute the new admin slugs array (add new, optionally remove old)
      const currentSlugs: string[] = adminDoc.data()?.slugs ?? [];
      let newSlugs = [...new Set([...currentSlugs, slug])];

      // Writes
      t.set(
        bizRef,
        { status: "onboarding_reserved", reservedBy: uid, reservedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );

      if (
        releaseRef &&
        releaseDoc?.exists &&
        releaseDoc.data()?.reservedBy === uid &&
        releaseDoc.data()?.status === "onboarding_reserved"
      ) {
        t.delete(releaseRef);
        newSlugs = newSlugs.filter((s) => s !== releaseSlug);
      }

      t.set(adminRef, { slugs: newSlugs }, { merge: true });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not reserve slug";
    const status = msg === "Slug already taken" ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true });
}
