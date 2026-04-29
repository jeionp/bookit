"use client";

import { useState, useRef, useEffect } from "react";
import { X, CalendarDays, Clock, User, Mail, Hash, AlertCircle, History } from "lucide-react";
import {
  Booking,
  cancelBooking,
  cancelBookingWithRefund,
  rescheduleBooking,
  getBookedHoursExcluding,
  getCustomerHistory,
  SlotUnavailableError,
} from "@/lib/firebase/bookings";
import { Business } from "@/lib/types";

function parseHour(timeStr: string): number {
  const [time, period] = timeStr.split(" ");
  const h = parseInt(time.split(":")[0], 10);
  if (period === "AM") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getOperatingHoursForDate(business: Business, dateStr: string): number[] {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayName = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long" });
  const oh = business.operatingHours.find((h) => h.day === dayName);
  if (!oh || oh.closed) return [];
  const open = parseHour(oh.open);
  const close = parseHour(oh.close);
  return Array.from({ length: close - open }, (_, i) => open + i);
}

function computePrice(business: Business, facilityId: string, hours: number[]): number {
  const facility = business.facilities.find((f) => f.id === facilityId);
  if (!facility) return 0;
  return hours.reduce((sum, h) => {
    const isPrime = facility.primeTimeStart != null && h >= facility.primeTimeStart;
    return sum + (isPrime ? (facility.primePricePerHour ?? facility.pricePerHour) : facility.pricePerHour);
  }, 0);
}

function PaymentBadge({ status }: { status?: "unpaid" | "paid" | "refunded" }) {
  if (!status || status === "unpaid") return null;
  const styles = {
    paid:     { bg: "#f0fdf4", color: "#16a34a", label: "Paid" },
    refunded: { bg: "#fef9c3", color: "#854d0e", label: "Refunded" },
  } as const;
  const { bg, color, label } = styles[status];
  return (
    <span
      className="inline-block text-xs font-bold px-3 py-1 rounded-full"
      style={{ backgroundColor: bg, color }}
      data-testid="payment-badge"
    >
      {label}
    </span>
  );
}

interface Props {
  booking: Booking;
  business: Business;
  onClose: () => void;
  onCancel: () => void;
  onReschedule: (updated: Booking) => void;
}

export default function BookingDetailPanel({ booking, business, onClose, onCancel, onReschedule }: Props) {
  const { accentColor } = business;
  const startHour = booking.hours[0];
  const endHour = booking.hours[booking.hours.length - 1] + 1;

  // "idle" → "refund_choice" (paid only) → "confirm" → done
  type CancelStep = "idle" | "refund_choice" | "confirm";
  const [cancelStep, setCancelStep] = useState<CancelStep>("idle");
  const [refundMethod, setRefundMethod] = useState<"refund" | "credit">("refund");
  const [cancelling, setCancelling] = useState(false);
  const isPaid = booking.paymentStatus === "paid";

  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [newFacilityId, setNewFacilityId] = useState(booking.facilityId);
  const [newDate, setNewDate] = useState(booking.date);
  const [newHours, setNewHours] = useState<number[]>(booking.hours);
  const [takenHours, setTakenHours] = useState<Set<number>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<Booking[]>([]);

  useEffect(() => {
    getCustomerHistory(business.slug, booking.userEmail, booking.id).then(setHistory);
  }, [business.slug, booking.userEmail, booking.id]);

  // Incremented on each new request so stale responses are discarded
  const slotRequestRef = useRef(0);

  function loadSlots(facilityId: string, date: string) {
    const reqId = ++slotRequestRef.current;
    setLoadingSlots(true);
    getBookedHoursExcluding(business.slug, facilityId, date, booking.id).then((taken) => {
      if (reqId !== slotRequestRef.current) return;
      setTakenHours(new Set(taken));
      setNewHours((prev) => prev.filter((h) => !taken.includes(h)));
      setLoadingSlots(false);
    });
  }

  function openReschedule() {
    setRescheduleMode(true);
    setError(null);
    loadSlots(newFacilityId, newDate);
  }

  function handleCourtChange(facilityId: string) {
    setNewFacilityId(facilityId);
    loadSlots(facilityId, newDate);
  }

  function handleDateChange(date: string) {
    setNewDate(date);
    loadSlots(newFacilityId, date);
  }

  function startCancel() {
    setCancelStep(isPaid ? "refund_choice" : "confirm");
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      if (isPaid) {
        await cancelBookingWithRefund(booking.id, refundMethod);
      } else {
        await cancelBooking(booking.id);
      }
      onCancel();
    } finally {
      setCancelling(false);
    }
  }

  async function handleReschedule() {
    if (newHours.length === 0) return;
    setSaving(true);
    setError(null);
    const sorted = newHours.slice().sort((a, b) => a - b);
    const newFacility = business.facilities.find((f) => f.id === newFacilityId)!;
    const newTotalPrice = computePrice(business, newFacilityId, sorted);
    try {
      await rescheduleBooking(
        booking.id,
        business.slug,
        newFacilityId,
        newFacility.name,
        newDate,
        sorted,
        newTotalPrice,
      );
      setRescheduleMode(false);
      onReschedule({ ...booking, facilityId: newFacilityId, facilityName: newFacility.name, date: newDate, hours: sorted, totalPrice: newTotalPrice });
    } catch (e) {
      setError(e instanceof SlotUnavailableError ? e.message : "Failed to reschedule. Please try again.");
      setSaving(false);
    }
  }

  function toggleHour(h: number) {
    setNewHours((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
    );
  }

  const operatingHours = rescheduleMode ? getOperatingHoursForDate(business, newDate) : [];
  const newPrice = computePrice(business, newFacilityId, newHours);

  return (
    <div data-testid="booking-detail-panel" className="w-72 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-900">
          {rescheduleMode ? "Reschedule Booking" : "Booking Detail"}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {rescheduleMode ? (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">
                Court
              </label>
              <select
                value={newFacilityId}
                onChange={(e) => handleCourtChange(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
                data-testid="reschedule-court-select"
              >
                {business.facilities.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">
                Date
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
                data-testid="reschedule-date-input"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">
                Time Slots
              </label>
              {loadingSlots ? (
                <p className="text-xs text-gray-400 py-2">Loading availability…</p>
              ) : operatingHours.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">Closed on this day</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {operatingHours.map((h) => {
                    const taken = takenHours.has(h);
                    const selected = newHours.includes(h);
                    return (
                      <button
                        key={h}
                        type="button"
                        disabled={taken}
                        onClick={() => toggleHour(h)}
                        className="text-xs py-1.5 px-2 rounded-md border font-medium transition-colors"
                        style={
                          selected
                            ? { backgroundColor: accentColor, borderColor: accentColor, color: "white" }
                            : taken
                            ? { backgroundColor: "#f9fafb", borderColor: "#e5e7eb", color: "#d1d5db", cursor: "not-allowed" }
                            : { backgroundColor: "white", borderColor: "#e5e7eb", color: "#374151" }
                        }
                      >
                        {formatHour(h)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {newHours.length > 0 && (
              <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="text-xs text-gray-500">New total: </span>
                <span className="text-sm font-bold text-gray-900">₱{newPrice.toLocaleString()}</span>
                <span className="text-xs text-gray-400 ml-1">({newHours.length}h)</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setRescheduleMode(false); setError(null); setLoadingSlots(false); }}
                disabled={saving}
                className="flex-1 text-sm font-semibold py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleReschedule}
                disabled={saving || newHours.length === 0 || loadingSlots}
                className="flex-1 text-sm font-semibold py-2 rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
                data-testid="confirm-reschedule-btn"
              >
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-block text-xs font-bold px-3 py-1 rounded-full"
                style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
              >
                Confirmed
              </span>
              <PaymentBadge status={booking.paymentStatus} />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Facility
              </p>
              <p className="text-sm font-bold text-gray-900">{booking.facilityName}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Date & Time
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <CalendarDays size={14} className="text-gray-400 shrink-0" />
                  {formatDate(booking.date)}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Clock size={14} className="text-gray-400 shrink-0" />
                  {formatHour(startHour)} – {formatHour(endHour)}
                  <span className="text-gray-400 text-xs">({booking.hours.length}h)</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Customer
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <User size={14} className="text-gray-400 shrink-0" />
                  {booking.userName}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
                  <Mail size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate text-xs">{booking.userEmail}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Total
              </p>
              <p className="text-2xl font-black text-gray-900">
                ₱{booking.totalPrice.toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Booking ID
              </p>
              <div className="flex items-start gap-1.5 text-xs text-gray-400 font-mono break-all">
                <Hash size={11} className="text-gray-300 shrink-0 mt-0.5" />
                {booking.id}
              </div>
            </div>

            {history.length > 0 && (
              <div data-testid="customer-history">
                <div className="flex items-center gap-1.5 mb-2">
                  <History size={13} className="text-gray-400 shrink-0" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Past bookings
                  </p>
                </div>
                <div className="space-y-1.5">
                  {history.map((b) => (
                    <div key={b.id} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <span>{b.facilityName} · {b.date}</span>
                      <span
                        className="font-semibold"
                        style={{ color: b.status === "cancelled" ? "#ef4444" : "#16a34a" }}
                      >
                        {b.status === "cancelled" ? "Cancelled" : "Confirmed"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 space-y-2 border-t border-gray-100">
              <button
                onClick={openReschedule}
                className="w-full text-sm font-semibold py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                data-testid="reschedule-btn"
              >
                Reschedule
              </button>

              {cancelStep === "refund_choice" && (
                <div className="space-y-3 bg-amber-50 rounded-lg p-3" data-testid="refund-choice">
                  <p className="text-xs font-semibold text-amber-800">
                    This booking was paid. How would you like to handle the refund?
                  </p>
                  <div className="space-y-1.5">
                    {(["refund", "credit"] as const).map((opt) => (
                      <label
                        key={opt}
                        className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="refundMethod"
                          value={opt}
                          checked={refundMethod === opt}
                          onChange={() => setRefundMethod(opt)}
                          className="mt-0.5 shrink-0"
                        />
                        {opt === "refund" ? (
                          <span>
                            <span className="font-semibold">Refund to payment method</span>
                            <br />
                            <span className="text-gray-400">5–10 business days via PayMongo</span>
                          </span>
                        ) : (
                          <span>
                            <span className="font-semibold">Issue store credit</span>
                            <br />
                            <span className="text-gray-400">Instant — customer can use it to rebook</span>
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCancelStep("idle")}
                      className="flex-1 text-xs font-semibold py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setCancelStep("confirm")}
                      className="flex-1 text-xs font-semibold py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                      data-testid="refund-choice-next-btn"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {cancelStep === "confirm" && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 text-center">Cancel this booking?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCancelStep(isPaid ? "refund_choice" : "idle")}
                      disabled={cancelling}
                      className="flex-1 text-xs font-semibold py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex-1 text-xs font-semibold py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                      data-testid="confirm-cancel-btn"
                    >
                      {cancelling ? "Cancelling…" : "Yes, cancel"}
                    </button>
                  </div>
                </div>
              )}

              {cancelStep === "idle" && (
                <button
                  onClick={startCancel}
                  className="w-full text-sm font-semibold py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                  data-testid="cancel-booking-btn"
                >
                  Cancel booking
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
