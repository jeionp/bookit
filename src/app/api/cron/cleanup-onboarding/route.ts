// Cron endpoint — deletes onboarding_reserved business placeholders older than 24 hours.
// Called by Vercel Cron (vercel.json) which injects Authorization: Bearer <CRON_SECRET>.
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

const RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = Timestamp.fromMillis(Date.now() - RESERVATION_TTL_MS);

  const stale = await adminDb
    .collection("businesses")
    .where("status", "==", "onboarding_reserved")
    .where("reservedAt", "<", cutoff)
    .get();

  if (stale.empty) {
    return NextResponse.json({ deleted: 0 });
  }

  // Group deletions into batches of 500 (Firestore limit).
  // Aggregate slug removals per user so each admin doc appears at most once per batch
  // (Firestore disallows multiple writes to the same document in a single batch).
  const BATCH_LIMIT = 500;
  let deleted = 0;

  for (let i = 0; i < stale.docs.length; i += BATCH_LIMIT) {
    const chunk = stale.docs.slice(i, i + BATCH_LIMIT);

    // Accumulate slugs to remove per owner
    const slugsByOwner = new Map<string, string[]>();
    for (const doc of chunk) {
      const { reservedBy, slug } = doc.data() as { reservedBy?: string; slug?: string };
      if (reservedBy && slug) {
        const existing = slugsByOwner.get(reservedBy) ?? [];
        existing.push(slug);
        slugsByOwner.set(reservedBy, existing);
      }
    }

    const batch = adminDb.batch();

    for (const doc of chunk) {
      batch.delete(doc.ref);
    }

    // One write per admin doc, removing all expired slugs at once
    for (const [ownerId, slugsToRemove] of slugsByOwner.entries()) {
      batch.set(
        adminDb.collection("admins").doc(ownerId),
        { slugs: FieldValue.arrayRemove(...slugsToRemove) },
        { merge: true },
      );
    }

    await batch.commit();
    deleted += chunk.length;
  }

  return NextResponse.json({ deleted });
}
