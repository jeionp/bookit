import { doc, getDoc } from "firebase/firestore";
import { db } from "./client";

export async function getAdminSlugs(uid: string): Promise<string[]> {
  const snap = await getDoc(doc(db, "admins", uid));
  if (!snap.exists()) return [];
  return (snap.data().slugs as string[]) ?? [];
}
