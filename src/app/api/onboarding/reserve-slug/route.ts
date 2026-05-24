import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { adminDb } from "@/lib/firebase/admin-app";
import { requireUser } from "@/lib/api/auth";
import { FieldValue } from "firebase-admin/firestore";
import { isValidSlug } from "@/lib/slugify";

const MAX_ACTIVE_RESERVATIONS = 3;

let ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  ratelimit = new Ratelimit({
    redis:   Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, "60 m"),
    prefix:  "bookit:rl:reserve-slug",
  });
  return ratelimit;
}

export async function POST(req: NextRequest) {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const uid = tokenOrRes.uid;

  const rl = getRatelimit();
  if (rl) {
    try {
      const { success } = await rl.limit(uid);
      if (!success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    } catch (err) {
      console.error("[api/onboarding/reserve-slug] rate-limit error:", err);
    }
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

      // Cap active reservations per user to prevent slug squatting.
      // Active reservations = slugs in admin doc that point to onboarding_reserved docs.
      // We approximate by counting slugs in the admin doc minus the one being released.
      const currentSlugs: string[] = adminDoc.data()?.slugs ?? [];
      const retainedSlugs = releaseSlug
        ? currentSlugs.filter((s) => s !== releaseSlug)
        : currentSlugs;

      // Exclude the current slug if it's already in the list (idempotent re-reserve)
      const newReservations = retainedSlugs.filter((s) => s !== slug);
      if (newReservations.length >= MAX_ACTIVE_RESERVATIONS) {
        throw new Error("RESERVATION_LIMIT");
      }

      let newSlugs = [...new Set([...retainedSlugs, slug])];

      // Writes
      t.set(
        bizRef,
        { status: "onboarding_reserved", reservedBy: uid, reservedAt: FieldValue.serverTimestamp() },
        { merge: true },
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
    if (msg === "Slug already taken") return NextResponse.json({ error: msg }, { status: 409 });
    if (msg === "RESERVATION_LIMIT")  return NextResponse.json({ error: "Too many active reservations" }, { status: 429 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
