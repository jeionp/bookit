"use client";

import { useState, useRef, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import {
  Booking,
  getBookedHoursExcluding,
  SlotUnavailableError,
} from "@/lib/firebase/bookings";
import { Business } from "@/lib/types";
import { formatHour, getOperatingHoursForDate } from "@/lib/slots";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function computePrice(business: Business, facilityId: string, hours: number[]): number {
  const facility = business.facilities.find((f) => f.id === facilityId);
  if (!facility) return 0;
  return hours.reduce((sum, h) => {
    const isPrime = facility.primeTimeStart != null && h >= facility.primeTimeStart;
    return sum + (isPrime ? (facility.primePricePerHour ?? facility.pricePerHour) : facility.pricePerHour);
  }, 0);
}

interface Props {
  booking: Booking;
  business: Business;
  accentColor: string;
  onExit: () => void;
  onReschedule: (updated: Booking) => void;
}

export default function RescheduleWizard({ booking, business, accentColor, onExit, onReschedule }: Props) {
  const startHour = booking.hours[0];
  const endHour = booking.hours[booking.hours.length - 1] + 1;

  const [newFacilityId, setNewFacilityId] = useState(booking.facilityId);
  const [newDate, setNewDate] = useState(booking.date);
  const [newHours, setNewHours] = useState<number[]>(booking.hours);
  const [takenHours, setTakenHours] = useState<Set<number>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const authedFetch = useAuthedFetch();

  const slotRequestRef = useRef(0);

  function loadSlots(facilityId: string, date: string, clearSelection = false) {
    const reqId = ++slotRequestRef.current;
    setLoadingSlots(true);
    if (clearSelection) setNewHours([]);
    getBookedHoursExcluding(business.slug, facilityId, date, booking.id).then((taken) => {
      if (reqId !== slotRequestRef.current) return;
      setTakenHours(new Set(taken));
      setLoadingSlots(false);
    });
  }

  // Fetch initial availability on mount; loadingSlots initializes as true so no synchronous setState needed
  useEffect(() => {
    const reqId = ++slotRequestRef.current;
    getBookedHoursExcluding(business.slug, booking.facilityId, booking.date, booking.id).then((taken) => {
      if (reqId !== slotRequestRef.current) return;
      setTakenHours(new Set(taken));
      setLoadingSlots(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCourtChange(facilityId: string) {
    setNewFacilityId(facilityId);
    loadSlots(facilityId, newDate, true);
  }

  function handleDateChange(date: string) {
    setNewDate(date);
    loadSlots(newFacilityId, date, true);
  }

  function toggleHour(h: number) {
    setNewHours((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
    );
  }

  async function handleReschedule() {
    if (newHours.length === 0) return;
    setSaving(true);
    setError(null);
    const sorted = newHours.slice().sort((a, b) => a - b);
    try {
      const res = await authedFetch("/api/reschedule", {
        method: "POST",
        body: JSON.stringify({ bookingId: booking.id, facilityId: newFacilityId, date: newDate, hours: sorted }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (res.status === 409) throw new SlotUnavailableError();
        throw new Error(body.error ?? "Failed to reschedule");
      }
      const { totalPrice, facilityName } = await res.json() as { totalPrice: number; facilityName: string };
      onReschedule({ ...booking, facilityId: newFacilityId, facilityName, date: newDate, hours: sorted, totalPrice });
    } catch (e) {
      setError(e instanceof SlotUnavailableError ? e.message : "Failed to reschedule. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const operatingHours = getOperatingHoursForDate(business, newDate);
  const newPrice = computePrice(business, newFacilityId, newHours);
  const sortedNewHours = newHours.slice().sort((a, b) => a - b);
  const newFacilityName = business.facilities.find((f) => f.id === newFacilityId)?.name ?? "";

  return (
    <>
      <div className="flex gap-1.5 mb-2">
        {([1, 2, 3] as const).map((s) => (
          <div
            key={s}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ backgroundColor: s <= step ? accentColor : "#e5e7eb" }}
          />
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Step {step} of 3 — {(["Date & Court", "Time Slots", "Confirm"] as const)[step - 1]}
      </p>

      <div className="rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-xs space-y-0.5 mb-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Currently booked</p>
        <p data-testid="reschedule-current-facility" className="text-gray-700 font-semibold">{booking.facilityName}</p>
        <p className="text-gray-500">{formatDate(booking.date)}</p>
        <p className="text-gray-500">
          {formatHour(startHour)} – {formatHour(endHour)}
          <span className="text-gray-400 ml-1">({booking.hours.length}h · ₱{booking.totalPrice.toLocaleString()})</span>
        </p>
      </div>

      {step === 1 && (
        <>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Court</label>
            <select
              value={newFacilityId}
              onChange={(e) => handleCourtChange(e.target.value)}
              className="w-full text-sm text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
              data-testid="reschedule-court-select"
            >
              {business.facilities.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full text-sm text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
              data-testid="reschedule-date-input"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onExit}
              className="flex-1 text-sm font-semibold py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => setStep(2)}
              className="flex-1 text-sm font-semibold py-2 rounded-lg text-white transition-colors"
              style={{ backgroundColor: accentColor }}
            >
              Next
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Time Slots</label>
            <p
              className="text-xs mb-2"
              data-testid="reschedule-advisory"
              style={{ color: newHours.length === booking.hours.length ? "#6b7280" : "#f59e0b" }}
            >
              {newHours.length === 0
                ? `Select ${booking.hours.length} hour${booking.hours.length > 1 ? "s" : ""} to match original`
                : newHours.length === booking.hours.length
                ? `${newHours.length} hour${newHours.length > 1 ? "s" : ""} selected — matches original`
                : `${newHours.length} of ${booking.hours.length} hour${booking.hours.length > 1 ? "s" : ""} selected`}
            </p>
            {loadingSlots ? (
              <p className="text-xs text-gray-400 py-2">Loading availability…</p>
            ) : operatingHours.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Closed on this day</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {operatingHours.map((h) => {
                  const taken = takenHours.has(h);
                  const selected = newHours.includes(h);
                  const wasOriginal =
                    booking.hours.includes(h) &&
                    newFacilityId === booking.facilityId &&
                    newDate === booking.date;
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={taken}
                      onClick={() => toggleHour(h)}
                      data-testid={`reschedule-slot-${h}`}
                      className="text-xs py-1.5 px-2 rounded-md border font-medium transition-colors"
                      style={
                        selected
                          ? { backgroundColor: accentColor, borderColor: accentColor, color: "white" }
                          : taken
                          ? { backgroundColor: "#f9fafb", borderColor: "#e5e7eb", color: "#d1d5db", cursor: "not-allowed" }
                          : wasOriginal
                          ? { backgroundColor: `${accentColor}18`, borderColor: accentColor, borderStyle: "dashed", color: accentColor }
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

          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 text-sm font-semibold py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={newHours.length === 0 || loadingSlots}
              className="flex-1 text-sm font-semibold py-2 rounded-lg text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: accentColor }}
            >
              Next
            </button>
          </div>
        </>
      )}

      {step === 3 && (() => {
        const priceDiff = newPrice - booking.totalPrice;
        return (
          <>
            <div className="rounded-lg border border-gray-200 overflow-hidden text-xs">
              <div className="grid grid-cols-2 divide-x divide-gray-200">
                <div className="p-3 space-y-1 bg-gray-50">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Before</p>
                  <p data-testid="reschedule-before-facility" className="font-semibold text-gray-700">{booking.facilityName}</p>
                  <p className="text-gray-500">{formatDate(booking.date)}</p>
                  <p className="text-gray-500">{formatHour(startHour)} – {formatHour(endHour)}</p>
                  <p className="font-bold text-gray-900 pt-0.5">₱{booking.totalPrice.toLocaleString()}</p>
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: accentColor }}>After</p>
                  <p data-testid="reschedule-after-facility" className="font-semibold text-gray-700">{newFacilityName}</p>
                  <p className="text-gray-500">{formatDate(newDate)}</p>
                  <p className="text-gray-500">
                    {sortedNewHours.length > 0
                      ? `${formatHour(sortedNewHours[0])} – ${formatHour(sortedNewHours[sortedNewHours.length - 1] + 1)}`
                      : "—"}
                  </p>
                  <p className="font-bold text-gray-900 pt-0.5">₱{newPrice.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {priceDiff !== 0 && (
              <p className="text-xs text-center" data-testid="reschedule-price-diff" style={{ color: priceDiff > 0 ? "#dc2626" : "#16a34a" }}>
                {priceDiff > 0
                  ? `+₱${priceDiff.toLocaleString()} more than original`
                  : `-₱${Math.abs(priceDiff).toLocaleString()} less than original`}
              </p>
            )}

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setStep(2); setError(null); }}
                disabled={saving}
                className="flex-1 text-sm font-semibold py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleReschedule}
                disabled={saving}
                className="flex-1 text-sm font-semibold py-2 rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
                data-testid="confirm-reschedule-btn"
              >
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </>
        );
      })()}
    </>
  );
}
