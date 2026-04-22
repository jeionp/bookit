"use client";

import { useState } from "react";
import { X, CalendarDays, Clock, MapPin } from "lucide-react";
import { createBooking } from "@/lib/firebase/bookings";
import { useAuth } from "@/context/AuthContext";

interface BookingSelection {
  facilityId: string;
  facilityName: string;
  hours: number[];
  pricePerHour: number;
}

interface BookingConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selection: BookingSelection | null;
  selectedDate: Date;
  businessSlug: string;
  businessName: string;
  businessLocation: string;
  accentColor: string;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export default function BookingConfirmModal({
  open,
  onClose,
  onSuccess,
  selection,
  selectedDate,
  businessSlug,
  businessName,
  businessLocation,
  accentColor,
}: BookingConfirmModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!open || !selection) return null;

  const totalPrice = selection.hours.length * selection.pricePerHour;
  const startHour = selection.hours[0];
  const endHour = selection.hours[selection.hours.length - 1] + 1;
  const dateStr = selectedDate.toISOString().split("T")[0];

  async function handleConfirm() {
    if (!user) return;
    setError("");
    setLoading(true);
    try {
      await createBooking({
        userId: user.uid,
        userEmail: user.email ?? "",
        userName: user.displayName ?? user.email ?? "",
        businessSlug,
        businessName,
        facilityId: selection!.facilityId,
        facilityName: selection!.facilityName,
        date: dateStr,
        hours: selection!.hours,
        totalPrice,
        currency: "PHP",
      });
      setDone(true);
    } catch {
      setError("Failed to save booking. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setDone(false);
    setError("");
    onClose();
    if (done) onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-gray-900">
            {done ? "Booking Confirmed!" : "Confirm Booking"}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          /* Success state */
          <div className="px-6 pb-8 text-center space-y-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-3xl"
              style={{ backgroundColor: `${accentColor}15` }}
            >
              🎉
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Your booking for <strong>{selection.facilityName}</strong> on{" "}
              <strong>
                {selectedDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </strong>{" "}
              from <strong>{formatHour(startHour)}</strong> to{" "}
              <strong>{formatHour(endHour)}</strong> has been confirmed.
            </p>
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              Done
            </button>
          </div>
        ) : (
          /* Confirmation details */
          <div className="px-6 pb-6 space-y-4">
            {/* Details card */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 font-medium">Venue</p>
                  <p className="text-sm font-bold text-gray-900">{businessName}</p>
                  <p className="text-xs text-gray-500">{businessLocation}</p>
                </div>
              </div>
              <div className="h-px bg-gray-200" />
              <div className="flex items-start gap-3">
                <CalendarDays size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 font-medium">Court & Date</p>
                  <p className="text-sm font-bold text-gray-900">{selection.facilityName}</p>
                  <p className="text-xs text-gray-500">
                    {selectedDate.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <div className="h-px bg-gray-200" />
              <div className="flex items-start gap-3">
                <Clock size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 font-medium">Time</p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatHour(startHour)} – {formatHour(endHour)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selection.hours.length} hr{selection.hours.length > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </div>

            {/* Price breakdown */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500">
                <span>
                  ₱{selection.pricePerHour.toLocaleString()} × {selection.hours.length} hr
                  {selection.hours.length > 1 ? "s" : ""}
                </span>
                <span>₱{totalPrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base font-black text-gray-900 pt-1.5 border-t border-gray-100">
                <span>Total</span>
                <span>₱{totalPrice.toLocaleString()}</span>
              </div>
            </div>

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
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
              >
                {loading ? "Saving…" : "Confirm →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
