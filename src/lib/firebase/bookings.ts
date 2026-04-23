import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
  runTransaction,
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

export class SlotUnavailableError extends Error {
  constructor() {
    super("One or more slots you selected were just booked by someone else. Please pick a different time.");
    this.name = "SlotUnavailableError";
  }
}

export async function createBooking(data: NewBooking): Promise<string> {
  const newDocRef = doc(collection(db, "bookings"));

  await runTransaction(db, async (tx) => {
    // Read all confirmed bookings for this court + date within the transaction
    const q = query(
      collection(db, "bookings"),
      where("businessSlug", "==", data.businessSlug),
      where("facilityId", "==", data.facilityId),
      where("date", "==", data.date),
      where("status", "==", "confirmed")
    );
    const snap = await getDocs(q);

    // Collect every hour already booked
    const takenHours = new Set<number>();
    snap.docs.forEach((d) => {
      (d.data().hours as number[]).forEach((h) => takenHours.add(h));
    });

    // Abort if any requested hour is already taken
    const conflict = data.hours.some((h) => takenHours.has(h));
    if (conflict) throw new SlotUnavailableError();

    // No conflict — write the new booking
    tx.set(newDocRef, {
      ...data,
      status: "confirmed",
      createdAt: Timestamp.now(),
    });
  });

  return newDocRef.id;
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

export async function getBookedHours(
  businessSlug: string,
  facilityId: string,
  date: string
): Promise<number[]> {
  const bookings = await getBookingsForDate(businessSlug, facilityId, date);
  return bookings.flatMap((b) => b.hours);
}
