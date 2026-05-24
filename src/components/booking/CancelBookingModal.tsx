"use client";

import { useMemo, useState } from "react";
import { X, AlertTriangle, Coins, RefreshCw } from "lucide-react";
import { Booking } from "@/lib/firebase/bookings";
import { useAuth } from "@/context/AuthContext";
import { formatHour } from "@/lib/slots";

interface CancelBookingModalProps {
  open: boolean;
  booking: Booking | null;
  onClose: () => void;
  onCancelled: (bookingId: string, creditIssued: number, currency: string) => void;
  accentColor?: string;
}

type Tier = "free" | "prorated" | "blocked";

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Uses default policy values for display; server enforces the real business policy on submit.
function computeCancelTier(booking: Booking): { tier: Tier; creditAmount: number } {
  const [y, m, d] = booking.date.split("-").map(Number);
  const bookingStartMs = new Date(y, m - 1, d, booking.hours[0]).getTime();
  const hoursUntil = (bookingStartMs - Date.now()) / 3_600_000;

  const freeCancelHours = 24;
  const noCancelHours = 2;

  if (hoursUntil <= noCancelHours) {
    return { tier: "blocked", creditAmount: 0 };
  }
  if (hoursUntil >= freeCancelHours) {
    return { tier: "free", creditAmount: booking.totalPrice };
  }
  const ratio = (hoursUntil - noCancelHours) / (freeCancelHours - noCancelHours);
  return {
    tier: "prorated",
    creditAmount: Math.round(booking.totalPrice * ratio * 100) / 100,
  };
}

export default function CancelBookingModal({
  open,
  booking,
  onClose,
  onCancelled,
  accentColor = "#6366f1",
}: CancelBookingModalProps) {
  const { user } = useAuth();
  const [choice, setChoice] = useState<"credit" | "refund_pending" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [finalCreditAmount, setFinalCreditAmount] = useState(0);

  const tierInfo = useMemo(
    () => (booking ? computeCancelTier(booking) : null),
    [booking],
  );

  if (!open || !booking || !tierInfo) return null;

  const { tier, creditAmount } = tierInfo;
  const pct = booking.totalPrice > 0
    ? Math.round((creditAmount / booking.totalPrice) * 100)
    : 0;
  const startHour = booking.hours[0];
  const endHour = booking.hours[booking.hours.length - 1] + 1;

  async function handleConfirm() {
    if (!user || !booking || !choice) return;
    setError("");
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ bookingId: booking.id, choice }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "CANCEL_BLOCKED") {
          setError("This booking is within the no-cancel window. Please contact the venue directly.");
        } else {
          setError("Failed to cancel. Please try again.");
        }
        return;
      }
      const issued = (data.creditAmount as number) ?? 0;
      setFinalCreditAmount(issued);
      setDone(true);
      onCancelled(booking.id, issued, (data.currency as string) ?? booking.currency);
    } catch {
      setError("Failed to cancel. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setChoice(null);
    setError("");
    setDone(false);
    setFinalCreditAmount(0);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-gray-900">
            {done ? "Booking Cancelled" : "Cancel Booking"}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="px-6 pb-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-2xl bg-gray-50">
              ✓
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-gray-900">Cancellation confirmed</p>
              {choice === "credit" && finalCreditAmount > 0 ? (
                <p className="text-sm text-gray-500">
                  <span className="font-bold" style={{ color: accentColor }}>
                    {booking.currency} {finalCreditAmount.toLocaleString()}
                  </span>{" "}
                  in credits added to your account at{" "}
                  <span className="font-semibold">{booking.businessName}</span>.
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  Your refund request has been submitted. The venue will process it manually.
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-6 pb-6 space-y-4">
            {/* Booking summary */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
              <p className="text-sm font-bold text-gray-900">{booking.facilityName}</p>
              <p className="text-xs text-gray-500">{booking.businessName}</p>
              <p className="text-xs text-gray-500">
                {formatDate(booking.date)} · {formatHour(startHour)}–{formatHour(endHour)}
              </p>
              <p className="text-sm font-black text-gray-900 pt-1">
                {booking.currency} {booking.totalPrice.toLocaleString()}
              </p>
            </div>

            {/* Tier messaging */}
            {tier === "blocked" && (
              <div className="flex gap-3 bg-red-50 rounded-2xl p-4">
                <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-red-700">Within no-cancel window</p>
                  <p className="text-xs text-red-500">
                    This booking starts in less than 2 hours. Please contact the venue directly to request a cancellation.
                  </p>
                </div>
              </div>
            )}

            {tier === "free" && (
              <div className="bg-green-50 rounded-2xl p-4">
                <p className="text-sm font-bold text-green-700">Free cancellation</p>
                <p className="text-xs text-green-600 mt-0.5">
                  You&apos;ll receive the full{" "}
                  <span className="font-bold">
                    {booking.currency} {booking.totalPrice.toLocaleString()}
                  </span>{" "}
                  as your choice below.
                </p>
              </div>
            )}

            {tier === "prorated" && (
              <div className="bg-amber-50 rounded-2xl p-4">
                <p className="text-sm font-bold text-amber-700">Prorated — {pct}% back</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  You&apos;re within 24 hours of your booking. You&apos;ll receive{" "}
                  <span className="font-bold">
                    {booking.currency} {creditAmount.toLocaleString()}
                  </span>{" "}
                  ({pct}%).
                </p>
              </div>
            )}

            {/* Choice — only when not blocked */}
            {tier !== "blocked" && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  How would you like your refund?
                </p>
                <button
                  onClick={() => setChoice("credit")}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-colors text-left"
                  style={
                    choice === "credit"
                      ? { borderColor: accentColor, backgroundColor: `${accentColor}08` }
                      : { borderColor: "#f3f4f6" }
                  }
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${accentColor}15` }}
                  >
                    <Coins size={16} style={{ color: accentColor }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">Keep as credits</p>
                    <p className="text-xs text-gray-500">
                      Instant · Valid 1 year at {booking.businessName}
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setChoice("refund_pending")}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-colors text-left"
                  style={
                    choice === "refund_pending"
                      ? { borderColor: "#9ca3af", backgroundColor: "#f9fafb" }
                      : { borderColor: "#f3f4f6" }
                  }
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-100">
                    <RefreshCw size={16} className="text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">Request refund</p>
                    <p className="text-xs text-gray-500">
                      Processed by the venue · May take 5–10 business days
                    </p>
                  </div>
                </button>
              </div>
            )}

            {error && (
              <p className="text-xs font-medium text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleClose}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Keep booking
              </button>
              {tier !== "blocked" && (
                <button
                  onClick={handleConfirm}
                  disabled={!choice || loading}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40"
                >
                  {loading ? "Cancelling…" : "Confirm cancel"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
