import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "./client";
import { Credit } from "@/lib/types";

export async function getCreditsByBusiness(
  userId: string,
  businessSlug: string,
): Promise<Credit[]> {
  const q = query(
    collection(db, "credits"),
    where("userId", "==", userId),
    where("businessSlug", "==", businessSlug),
    orderBy("createdAt", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Credit));
}

export async function getAllCreditsByUser(userId: string): Promise<Credit[]> {
  const q = query(
    collection(db, "credits"),
    where("userId", "==", userId),
    orderBy("createdAt", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Credit));
}

export function computeBalance(credits: Credit[]): number {
  const now = Timestamp.now().toMillis();
  const issued = credits
    .filter((c) => c.type === "issued" && !c.voided && c.expiresAt.toMillis() > now)
    .reduce((sum, c) => sum + c.amount, 0);
  const redeemed = credits
    .filter((c) => c.type === "redeemed")
    .reduce((sum, c) => sum + c.amount, 0);
  return Math.max(0, Math.round((issued - redeemed) * 100) / 100);
}

// Returns a map of businessSlug → balance from a flat credit list.
export function groupBalancesByBusiness(
  credits: Credit[],
): Record<string, { balance: number; currency: string; businessName: string }> {
  const slugs = [...new Set(credits.map((c) => c.businessSlug))];
  return Object.fromEntries(
    slugs.map((slug) => {
      const forBiz = credits.filter((c) => c.businessSlug === slug);
      const balance = computeBalance(forBiz);
      const ref = forBiz[0];
      return [slug, { balance, currency: ref.currency, businessName: ref.businessName }];
    }),
  );
}
