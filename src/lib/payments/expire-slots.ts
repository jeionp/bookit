import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin-app";

export interface ExpireSlotsResult {
  expired: number;
}

export async function expireHeldSlots(): Promise<ExpireSlotsResult> {
  const now = Timestamp.now();

  const snap = await adminDb
    .collection("bookings")
    .where("status", "==", "slot_held")
    .where("held_until", "<", now)
    .get();

  if (snap.empty) return { expired: 0 };

  const batch = adminDb.batch();
  for (const docSnap of snap.docs) {
    batch.update(docSnap.ref, {
      status: "expired",
      expired_at: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  return { expired: snap.size };
}
