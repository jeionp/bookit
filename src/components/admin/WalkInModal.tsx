"use client";

import { useState, useRef, useEffect } from "react";
import { X, Search, AlertCircle, UserCheck } from "lucide-react";
import { Business } from "@/lib/types";
import {
  createWalkInBooking,
  getBookedHours,
  lookupCustomerByEmail,
  SlotUnavailableError,
} from "@/lib/firebase/bookings";

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

function getOperatingHours(business: Business, dateStr: string): number[] {
  if (!dateStr) return [];
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

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  business: Business;
  initialDate: string;
  onClose: () => void;
  onBooked: () => void;
}

export default function WalkInModal({ business, initialDate, onClose, onBooked }: Props) {
  const { accentColor } = business;

  const [facilityId, setFacilityId] = useState(business.facilities[0]?.id ?? "");
  const [date, setDate] = useState(initialDate || todayString());
  const [selectedHours, setSelectedHours] = useState<number[]>([]);
  const [takenHours, setTakenHours] = useState<Set<number>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(true);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedUserId, setLinkedUserId] = useState("walk_in");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [customerFound, setCustomerFound] = useState(false);
  const [sendInvite, setSendInvite] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotReqRef = useRef(0);

  function loadSlots(fId: string, d: string) {
    if (!d) return;
    const reqId = ++slotReqRef.current;
    setLoadingSlots(true);
    setSelectedHours([]);
    getBookedHours(business.slug, fId, d).then((taken) => {
      if (reqId !== slotReqRef.current) return;
      setTakenHours(new Set(taken));
      setLoadingSlots(false);
    });
  }

  useEffect(() => {
    const reqId = ++slotReqRef.current;
    getBookedHours(business.slug, facilityId, date).then((taken) => {
      if (reqId !== slotReqRef.current) return;
      setTakenHours(new Set(taken));
      setLoadingSlots(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFacilityChange(id: string) {
    setFacilityId(id);
    loadSlots(id, date);
  }

  function handleDateChange(d: string) {
    setDate(d);
    loadSlots(facilityId, d);
  }

  function toggleHour(h: number) {
    setSelectedHours((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
    );
  }

  async function handleLookup() {
    if (!email.trim()) return;
    setLookingUp(true);
    setLookupDone(false);
    setCustomerFound(false);
    const result = await lookupCustomerByEmail(business.slug, email.trim());
    setLookingUp(false);
    setLookupDone(true);
    if (result) {
      setName(result.userName);
      setLinkedUserId(result.userId);
      setCustomerFound(true);
    } else {
      setLinkedUserId("walk_in");
      setCustomerFound(false);
    }
  }

  function handleEmailChange(v: string) {
    setEmail(v);
    setLookupDone(false);
    setCustomerFound(false);
    setLinkedUserId("walk_in");
  }

  async function handleBook() {
    if (selectedHours.length === 0) return;
    setSaving(true);
    setError(null);
    const sorted = selectedHours.slice().sort((a, b) => a - b);
    const facility = business.facilities.find((f) => f.id === facilityId)!;
    const totalPrice = computePrice(business, facilityId, sorted);

    try {
      const walkinData: Parameters<typeof createWalkInBooking>[0] = {
        facilityId,
        facilityName: facility.name,
        date,
        hours: sorted,
        businessSlug: business.slug,
        businessName: business.name,
        totalPrice,
        currency: facility.currency,
        userName: name.trim() || "Walk-in",
        userEmail: email.trim(),
        userId: linkedUserId,
      };
      if (phone.trim()) walkinData.userPhone = phone.trim();
      await createWalkInBooking(walkinData);

      if (sendInvite && email.trim()) {
        await fetch("/api/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            name: name.trim() || undefined,
            businessSlug: business.slug,
            businessName: business.name,
          }),
        });
      }

      onBooked();
    } catch (e) {
      setError(e instanceof SlotUnavailableError ? e.message : "Failed to create booking. Please try again.");
      setSaving(false);
    }
  }

  const operatingHours = getOperatingHours(business, date);
  const totalPrice = computePrice(business, facilityId, selectedHours);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="walkin-modal"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <span className="text-sm font-bold text-gray-900">New Walk-in Booking</span>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Court */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Court</label>
            <select
              value={facilityId}
              onChange={(e) => handleFacilityChange(e.target.value)}
              className="w-full text-sm text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
              data-testid="walkin-court-select"
            >
              {business.facilities.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full text-sm text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
              data-testid="walkin-date-input"
            />
          </div>

          {/* Time slots */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Time Slots</label>
            {loadingSlots ? (
              <p className="text-xs text-gray-400 py-2">Loading availability…</p>
            ) : operatingHours.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Closed on this day</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {operatingHours.map((h) => {
                  const taken = takenHours.has(h);
                  const sel = selectedHours.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={taken}
                      onClick={() => toggleHour(h)}
                      className="text-xs py-1.5 px-2 rounded-md border font-medium transition-colors"
                      style={
                        sel
                          ? { backgroundColor: accentColor, borderColor: accentColor, color: "white" }
                          : taken
                          ? { backgroundColor: "#f9fafb", borderColor: "#e5e7eb", color: "#d1d5db", cursor: "not-allowed" }
                          : { backgroundColor: "white", borderColor: "#e5e7eb", color: "#374151" }
                      }
                      data-testid={`walkin-slot-${h}`}
                    >
                      {formatHour(h)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Customer info */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer (optional)</p>

            {/* Email lookup */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Email</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="customer@email.com"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
                  data-testid="walkin-email-input"
                />
                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={!email.trim() || lookingUp}
                  className="shrink-0 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  data-testid="walkin-lookup-btn"
                >
                  {lookingUp ? <Search size={13} className="animate-spin" /> : <Search size={13} />}
                </button>
              </div>
              {lookupDone && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${customerFound ? "text-green-600" : "text-gray-400"}`}>
                  {customerFound
                    ? <><UserCheck size={11} /> Existing customer found — details pre-filled</>
                    : "No existing customer found"}
                </p>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Name</label>
              <input
                type="text"
                placeholder="Walk-in"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
                data-testid="walkin-name-input"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Phone</label>
              <input
                type="tel"
                placeholder="+63 9XX XXX XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
                data-testid="walkin-phone-input"
              />
            </div>

            {/* Signup invite */}
            {email.trim() && lookupDone && !customerFound && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="mt-0.5 shrink-0"
                  data-testid="walkin-invite-checkbox"
                />
                <span className="text-xs text-gray-600">
                  Send signup invite to <span className="font-semibold">{email}</span>
                  <br />
                  <span className="text-gray-400">They can create an account to manage future bookings</span>
                </span>
              </label>
            )}
          </div>

          {/* Price */}
          {selectedHours.length > 0 && (
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <span className="text-xs text-gray-500">Total: </span>
              <span className="text-sm font-bold text-gray-900">₱{totalPrice.toLocaleString()}</span>
              <span className="text-xs text-gray-400 ml-1">({selectedHours.length}h)</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 text-sm font-semibold py-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBook}
              disabled={saving || selectedHours.length === 0 || loadingSlots}
              className="flex-1 text-sm font-semibold py-2.5 rounded-lg text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: accentColor }}
              data-testid="walkin-book-btn"
            >
              {saving ? "Booking…" : "Book slot"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
