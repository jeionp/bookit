import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "./client";

export interface Booking {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  businessSlug: string;
  businessName: string;
  facilityId: string;
  facilityName: string;
  date: string;       // "2026-04-22"
  hours: number[];    // [9, 10] = 9 AM and 10 AM slots
  totalPrice: number;
  currency: string;
  status: "confirmed" | "cancelled";
  createdAt: Timestamp;
}

export type NewBooking = Omit<Booking, "id" | "createdAt" | "status">;

export async function createBooking(data: NewBooking): Promise<string> {
  const ref = await addDoc(collection(db, "bookings"), {
    ...data,
    status: "confirmed",
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

export async function getUserBookings(userId: string): Promise<Booking[]> {
  const q = query(
    collection(db, "bookings"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));
}

export async function cancelBooking(bookingId: string): Promise<void> {
  await updateDoc(doc(db, "bookings", bookingId), { status: "cancelled" });
}

export async function getBookingsForDate(
  businessSlug: string,
  facilityId: string,
  date: string
): Promise<Booking[]> {
  const q = query(
    collection(db, "bookings"),
    where("businessSlug", "==", businessSlug),
    where("facilityId", "==", facilityId),
    where("date", "==", date),
    where("status", "==", "confirmed")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));
}
