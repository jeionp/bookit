import { adminDb } from "./admin-app";
import type { Business } from "@/lib/types";

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const snap = await adminDb.collection("businesses").doc(slug).get();
  if (!snap.exists) return null;
  return { slug, ...(snap.data() as Omit<Business, "slug">) };
}

export async function listBusinesses(query?: string): Promise<Business[]> {
  const snap = await adminDb.collection("businesses").limit(60).get();
  let businesses = snap.docs
    .map((doc) => ({ slug: doc.id, ...(doc.data() as Omit<Business, "slug">) }))
    .filter((b) => b.status !== "suspended");

  if (!query) return businesses;

  const q = query.toLowerCase();
  return businesses.filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      (b.location ?? "").toLowerCase().includes(q)
  );
}
