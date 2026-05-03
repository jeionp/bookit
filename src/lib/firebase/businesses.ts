import { adminDb } from "./admin-app";
import type { Business } from "@/lib/types";

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const snap = await adminDb.collection("businesses").doc(slug).get();
  if (!snap.exists) return null;
  return { slug, ...(snap.data() as Omit<Business, "slug">) };
}
