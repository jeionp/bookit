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

export type BookingStatus = "confirmed" | "cancelled" | "slot_held" | "expired";
export type CheckoutType = "P2P_AI" | "GATEWAY_SPLIT" | "PAY_AT_VENUE";
export type PaymentStatusV2 = "pending_proof" | "ai_review" | "paid" | "rejected" | "pending_cash" | "pending_gateway";
export type CancelledBy = "user" | "merchant" | "system";

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
  status: BookingStatus;
  paymentStatus?: "unpaid" | "paid" | "refunded" | "credited" | "refund_pending";
  creditApplied?: number;
  source?: "online" | "walk_in";
  userPhone?: string;
  reminderSent?: boolean;
  createdAt: Timestamp;
  // P2P / gateway payment fields — absent on legacy bookings
  checkout_type?: CheckoutType;
  payment_status_v2?: PaymentStatusV2;
  proof_of_payment_url?: string | null;
  proof_url?: string | null;            // actual Firestore field written by submit-proof
  receipt_reference_number?: string | null;
  gateway_session_id?: string | null;
  held_until?: Timestamp | null;
  cancelled_by?: CancelledBy;
  cancellation_reason?: string;
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
    const existing = await getBookingsForDate(data.businessSlug, data.facilityId, data.date);
    const takenHours = new Set<number>(existing.flatMap((b) => b.hours));
    if (data.hours.some((h) => takenHours.has(h))) throw new SlotUnavailableError();

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

// TOCTOU note: Firestore is updated before the /api/refund call resolves.
// If the API call fails, the booking appears refunded in the UI but the actual
// payment refund was never issued. This is acceptable until PayMongo is wired up,
// but should be addressed (idempotent retry or server-side transaction) before go-live.
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
    const existing = await getBookingsForDate(businessSlug, newFacilityId, newDate);
    // Exclude the booking being rescheduled — same court/date means its own hours aren't a conflict.
    const takenHours = new Set<number>(
      existing.filter((b) => b.id !== bookingId).flatMap((b) => b.hours)
    );
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
// Fetches limit(6) so there is a candidate to drop via the excludeBookingId filter —
// after filtering out the excluded doc, slice(0, 5) guarantees at most 5 results.
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
    where("status", "in", ["confirmed", "slot_held"])
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
    const existing = await getBookingsForDate(data.businessSlug, data.facilityId, data.date);
    const takenHours = new Set<number>(existing.flatMap((b) => b.hours));
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
