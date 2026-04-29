import {
  collection,
  query,
  where,
  orderBy,
  limit,
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
  paymentStatus?: "unpaid" | "paid" | "refunded";
  source?: "online" | "walk_in";
  userPhone?: string;
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

export async function cancelBookingWithRefund(
  bookingId: string,
  refundMethod: "refund" | "credit",
): Promise<void> {
  await updateDoc(doc(db, "bookings", bookingId), {
    status: "cancelled",
    paymentStatus: "refunded",
  });
  await fetch("/api/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, method: refundMethod }),
  });
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

export async function getBookedHoursExcluding(
  businessSlug: string,
  facilityId: string,
  date: string,
  excludeBookingId: string,
): Promise<number[]> {
  const bookings = await getBookingsForDate(businessSlug, facilityId, date);
  return bookings
    .filter((b) => b.id !== excludeBookingId)
    .flatMap((b) => b.hours);
}

export async function rescheduleBooking(
  bookingId: string,
  businessSlug: string,
  newFacilityId: string,
  newFacilityName: string,
  newDate: string,
  newHours: number[],
  newTotalPrice: number,
): Promise<void> {
  const bookingRef = doc(db, "bookings", bookingId);

  await runTransaction(db, async (tx) => {
    const q = query(
      collection(db, "bookings"),
      where("businessSlug", "==", businessSlug),
      where("facilityId", "==", newFacilityId),
      where("date", "==", newDate),
      where("status", "==", "confirmed")
    );
    const snap = await getDocs(q);

    const takenHours = new Set<number>();
    snap.docs
      .filter((d) => d.id !== bookingId)
      .forEach((d) => {
        (d.data().hours as number[]).forEach((h) => takenHours.add(h));
      });

    if (newHours.some((h) => takenHours.has(h))) throw new SlotUnavailableError();

    tx.update(bookingRef, {
      facilityId: newFacilityId,
      facilityName: newFacilityName,
      date: newDate,
      hours: newHours,
      totalPrice: newTotalPrice,
    });
  });
}

// Requires composite index: businessSlug ASC, date ASC
// Firebase will surface a link to auto-create it on first run if missing.
export async function getBookingsInRange(
  businessSlug: string,
  startDate: string,
  endDate: string,
): Promise<Booking[]> {
  const q = query(
    collection(db, "bookings"),
    where("businessSlug", "==", businessSlug),
    where("date", ">=", startDate),
    where("date", "<=", endDate),
    orderBy("date", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));
}

// Returns the last 5 bookings for a customer at a business, excluding the current booking.
// Requires composite index: businessSlug ASC, userEmail ASC, createdAt DESC (firestore.indexes.json).
export async function getCustomerHistory(
  businessSlug: string,
  userEmail: string,
  excludeBookingId: string,
): Promise<Booking[]> {
  const q = query(
    collection(db, "bookings"),
    where("businessSlug", "==", businessSlug),
    where("userEmail", "==", userEmail),
    orderBy("createdAt", "desc"),
    limit(6),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Booking))
    .filter((b) => b.id !== excludeBookingId)
    .slice(0, 5);
}

// Requires a composite index: businessSlug ASC, date ASC, status ASC
// Firebase will surface a link to auto-create it on first run if missing.
export async function getAllBookingsForDay(
  businessSlug: string,
  date: string
): Promise<Booking[]> {
  const q = query(
    collection(db, "bookings"),
    where("businessSlug", "==", businessSlug),
    where("date", "==", date),
    where("status", "==", "confirmed")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));
}

// Looks up a customer's most recent booking by email to pre-fill their name.
export async function lookupCustomerByEmail(
  businessSlug: string,
  userEmail: string,
): Promise<{ userName: string; userId: string } | null> {
  const q = query(
    collection(db, "bookings"),
    where("businessSlug", "==", businessSlug),
    where("userEmail", "==", userEmail),
    orderBy("createdAt", "desc"),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return { userName: data.userName as string, userId: data.userId as string };
}

export interface WalkInBookingData {
  facilityId:   string;
  facilityName: string;
  date:         string;
  hours:        number[];
  businessSlug: string;
  businessName: string;
  totalPrice:   number;
  currency:     string;
  userName:     string;
  userEmail:    string;
  userPhone?:   string;
  userId:       string;
}

export async function createWalkInBooking(data: WalkInBookingData): Promise<string> {
  const newDocRef = doc(collection(db, "bookings"));

  await runTransaction(db, async (tx) => {
    const q = query(
      collection(db, "bookings"),
      where("businessSlug", "==", data.businessSlug),
      where("facilityId", "==", data.facilityId),
      where("date", "==", data.date),
      where("status", "==", "confirmed")
    );
    const snap = await getDocs(q);

    const takenHours = new Set<number>();
    snap.docs.forEach((d) => {
      (d.data().hours as number[]).forEach((h) => takenHours.add(h));
    });

    if (data.hours.some((h) => takenHours.has(h))) throw new SlotUnavailableError();

    tx.set(newDocRef, {
      ...data,
      status: "confirmed",
      source: "walk_in",
      createdAt: Timestamp.now(),
    });
  });

  return newDocRef.id;
}
