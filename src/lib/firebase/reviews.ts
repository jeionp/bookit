import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  limit,
} from "firebase/firestore";
import { db } from "./client";
import type { Review } from "@/lib/types";

export async function getReviewsForBusiness(
  businessSlug: string,
  maxResults = 10,
): Promise<Review[]> {
  const ref = collection(db, "businesses", businessSlug, "reviews");
  const q = query(ref, orderBy("createdAt", "desc"), limit(maxResults));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
}

export async function getReviewByBookingId(
  businessSlug: string,
  bookingId: string,
): Promise<Review | null> {
  const ref = doc(db, "businesses", businessSlug, "reviews", bookingId);
  const snap = await getDoc(ref);
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Review) : null;
}

export async function getReviewedBookingIds(
  businessSlug: string,
  userId: string,
): Promise<Set<string>> {
  const ref = collection(db, "businesses", businessSlug, "reviews");
  const q = query(ref, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const ids = new Set<string>();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.userId === userId) ids.add(d.id);
  });
  return ids;
}
