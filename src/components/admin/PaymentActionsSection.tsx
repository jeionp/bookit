"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Booking, BookingStatus, PaymentStatusV2 } from "@/lib/firebase/bookings";
import type { User } from "firebase/auth";

interface Props {
  booking: Booking;
  user: User | null;
  localPaymentStatus: PaymentStatusV2 | undefined;
  onStatusChange: (paymentStatus: PaymentStatusV2 | undefined, bookingStatus?: BookingStatus) => void;
}

export default function PaymentActionsSection({ booking, user, localPaymentStatus, onStatusChange }: Props) {
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);

  async function callPaymentAction(action: "approve" | "reject" | "mark_paid") {
    if (!user) return;
    setPaymentActionLoading(true);
    setPaymentActionError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/bookings/${booking.id}/payment-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setPaymentActionError("Action failed. Please try again.");
        return;
      }
      if (action === "approve") {
        onStatusChange("paid", "confirmed");
      } else if (action === "reject") {
        onStatusChange("rejected");
      } else {
        onStatusChange("paid");
      }
    } catch {
      setPaymentActionError("Action failed. Please try again.");
    } finally {
      setPaymentActionLoading(false);
    }
  }

  async function callSimulate(outcome: "success" | "failure") {
    setSimulateLoading(true);
    setSimulateError(null);
    try {
      const res = await fetch("/api/payments/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, outcome }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSimulateError((body as { error?: string }).error ?? "Simulate failed");
        return;
      }
      if (outcome === "success") {
        onStatusChange("paid", "confirmed");
      } else {
        onStatusChange("rejected", "expired");
      }
    } catch {
      setSimulateError("Network error");
    } finally {
      setSimulateLoading(false);
    }
  }

  const hasActions =
    (booking.checkout_type === "P2P_AI" && localPaymentStatus === "ai_review") ||
    (booking.checkout_type === "PAY_AT_VENUE" && localPaymentStatus === "pending_cash") ||
    (booking.checkout_type === "GATEWAY_SPLIT" && localPaymentStatus === "pending_gateway");

  if (!hasActions && !paymentActionError) return null;

  return (
    <>
      {paymentActionError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="shrink-0" />
          {paymentActionError}
        </div>
      )}

      {booking.checkout_type === "P2P_AI" && localPaymentStatus === "ai_review" && (
        <div className="space-y-2">
          <button
            onClick={() => callPaymentAction("approve")}
            disabled={paymentActionLoading}
            className="w-full text-sm font-semibold py-2 rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: "#16a34a" }}
            data-testid="approve-payment-btn"
          >
            {paymentActionLoading ? "Processing…" : "Approve Payment"}
          </button>
          <button
            onClick={() => callPaymentAction("reject")}
            disabled={paymentActionLoading}
            className="w-full text-sm font-semibold py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            data-testid="reject-payment-btn"
          >
            Reject Payment
          </button>
        </div>
      )}

      {booking.checkout_type === "PAY_AT_VENUE" && localPaymentStatus === "pending_cash" && (
        <button
          onClick={() => callPaymentAction("mark_paid")}
          disabled={paymentActionLoading}
          className="w-full text-sm font-semibold py-2 rounded-lg text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: "#7c3aed" }}
          data-testid="mark-paid-btn"
        >
          {paymentActionLoading ? "Processing…" : "Mark as Paid"}
        </button>
      )}

      {booking.checkout_type === "GATEWAY_SPLIT" && localPaymentStatus === "pending_gateway" && (
        <div className="space-y-2 border border-dashed border-amber-200 rounded-xl p-3 bg-amber-50">
          <p className="text-xs font-semibold text-amber-700">Testing Mode — Simulate Payment</p>
          {simulateError && <p className="text-xs text-red-600">{simulateError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void callSimulate("success")}
              disabled={simulateLoading}
              className="flex-1 text-xs font-semibold py-2 rounded-lg text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#16a34a" }}
              data-testid="simulate-success-btn"
            >
              {simulateLoading ? "Processing…" : "Simulate Success"}
            </button>
            <button
              onClick={() => void callSimulate("failure")}
              disabled={simulateLoading}
              className="flex-1 text-xs font-semibold py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              data-testid="simulate-failure-btn"
            >
              Simulate Failure
            </button>
          </div>
        </div>
      )}
    </>
  );
}
