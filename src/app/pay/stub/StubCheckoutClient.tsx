"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Shield, CreditCard, Smartphone, Wallet, Loader2 } from "lucide-react";

type PaymentMethod = "gcash" | "maya" | "card";

const METHODS: { id: PaymentMethod; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "gcash",  label: "GCash",        icon: <Smartphone size={16} />, hint: "Mobile number on file" },
  { id: "maya",   label: "Maya",         icon: <Wallet size={16} />,    hint: "Mobile number on file" },
  { id: "card",   label: "Credit/Debit", icon: <CreditCard size={16} />, hint: "Visa, Mastercard, JCB" },
];

export default function StubCheckoutClient() {
  const params       = useSearchParams();
  const bookingId    = params.get("bookingId") ?? "";
  const amountCents  = parseInt(params.get("amount") ?? "0", 10);
  const currency     = params.get("currency") ?? "PHP";
  const description  = params.get("description") ?? "";
  const successUrl   = params.get("successUrl") ?? "/";
  const cancelUrl    = params.get("cancelUrl") ?? "/";

  const amountFormatted = (amountCents / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const currencyLabel = currency === "PHP" ? "₱" : currency;

  const [method, setMethod] = useState<PaymentMethod>("gcash");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  async function handlePay() {
    setProcessing(true);
    setError("");
    try {
      const res = await fetch("/api/payments/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, outcome: "success" }),
      });
      if (!res.ok) {
        setError("Payment could not be processed. Please try again.");
        return;
      }
      window.location.href = successUrl;
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleFailure() {
    setProcessing(true);
    try {
      await fetch("/api/payments/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, outcome: "failure" }),
      });
    } catch {
      // best-effort — redirect regardless
    }
    window.location.href = cancelUrl;
  }

  function handleCancel() {
    window.location.href = cancelUrl;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-600">
          <Shield size={16} className="text-green-600" />
          <span className="text-sm font-semibold">Secure Checkout</span>
        </div>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">
          Test Mode
        </span>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg overflow-hidden">
        {/* Order summary */}
        <div className="bg-gray-50 px-6 py-5 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Order Summary</p>
          <p className="text-sm font-semibold text-gray-800 leading-snug">{description}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">Amount due</span>
            <span className="text-2xl font-black text-gray-900">
              {currencyLabel}{amountFormatted}
            </span>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Payment method tabs */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Payment Method</p>
            <div className="flex gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-semibold transition-colors"
                  style={
                    method === m.id
                      ? { borderColor: "#2563eb", backgroundColor: "#eff6ff", color: "#2563eb" }
                      : { borderColor: "#e5e7eb", backgroundColor: "#fafafa", color: "#6b7280" }
                  }
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400 text-center">
              {METHODS.find((m) => m.id === method)?.hint}
            </p>
          </div>

          {/* Simulated method field — visual only */}
          <div className="h-11 rounded-xl bg-gray-50 border border-gray-200 flex items-center px-4">
            <span className="text-sm text-gray-300 select-none">
              {method === "card" ? "Card number" : "Mobile number"}
            </span>
          </div>

          {error && (
            <p className="text-xs font-medium text-red-500 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Pay button */}
          <button
            onClick={handlePay}
            disabled={processing}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing…
              </>
            ) : (
              `Pay ${currencyLabel}${amountFormatted}`
            )}
          </button>

          {/* Test mode controls */}
          <div className="border-t border-dashed border-amber-200 pt-4 space-y-2">
            <p className="text-xs text-center text-amber-600 font-semibold">
              ⚠ Testing Mode — no real charge
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleFailure}
                disabled={processing}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                Simulate Failure
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={processing}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Booking ref: {bookingId || "—"}
      </p>
    </div>
  );
}
