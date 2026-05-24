"use client";

import { useState } from "react";
import { cancelBooking, cancelBookingWithRefund } from "@/lib/firebase/bookings";
import type { Booking } from "@/lib/firebase/bookings";

interface Props {
  booking: Booking;
  isPaid: boolean;
  onOpenReschedule: () => void;
  onCancel: () => void;
}

export default function BookingCancelSection({ booking, isPaid, onOpenReschedule, onCancel }: Props) {
  type CancelStep = "idle" | "refund_choice" | "confirm";
  const [cancelStep, setCancelStep] = useState<CancelStep>("idle");
  const [refundMethod, setRefundMethod] = useState<"refund" | "credit">("refund");
  const [cancelling, setCancelling] = useState(false);

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

  return (
    <div className="pt-2 space-y-2 border-t border-gray-100">
      <button
        onClick={onOpenReschedule}
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
              <label key={opt} className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
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
  );
}
