"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { X, CalendarDays, Clock, MapPin, Coins, QrCode, Upload, Banknote, CreditCard } from "lucide-react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/context/AuthContext";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { getCreditsByBusiness, computeBalance } from "@/lib/firebase/credits";
import { storage } from "@/lib/firebase/client";
import { formatHour } from "@/lib/slots";

interface BookingSelection {
  facilityId: string;
  facilityName: string;
  hours: number[];
  pricePerHour: number;
  primePricePerHour?: number;
  primeTimeStart?: number;
  totalPrice: number;
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
  acceptsQr?: boolean;
  acceptsCash?: boolean;
  acceptsGateway?: boolean;
  staticQrUrl?: string | null;
}

type CheckoutState = "confirmed" | "PAY_AT_VENUE" | "P2P_AI" | "P2P_upload" | "P2P_submitted" | "GATEWAY_SPLIT" | null;

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
  acceptsQr,
  acceptsCash,
  acceptsGateway,
  staticQrUrl,
}: BookingConfirmModalProps) {
  const { user } = useAuth();
  const authedFetch = useAuthedFetch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkoutType, setCheckoutType] = useState<CheckoutState>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState(0);
  const [useCredits, setUseCredits] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // When multiple payment options are available the player must pick one before confirming.
  const optionCount = [acceptsQr, acceptsCash, acceptsGateway].filter(Boolean).length;
  const multipleOptions = optionCount > 1;
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<"P2P_AI" | "PAY_AT_VENUE" | "GATEWAY_SPLIT" | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    getCreditsByBusiness(user.uid, businessSlug)
      .then((credits) => {
        const balance = computeBalance(credits);
        setCreditBalance(balance);
        if (balance > 0) setUseCredits(true);
      })
      .catch(() => setCreditBalance(0));
  }, [open, user, businessSlug]);

  if (!open || !selection) return null;

  const { pricePerHour, primePricePerHour, primeTimeStart, totalPrice } = selection;
  const appliedCredit = useCredits ? Math.min(creditBalance, totalPrice) : 0;
  const amountDue = Math.max(0, totalPrice - appliedCredit);
  const normalHours = primeTimeStart
    ? selection.hours.filter((h) => h < primeTimeStart)
    : selection.hours;
  const primeHours = primeTimeStart && primePricePerHour
    ? selection.hours.filter((h) => h >= primeTimeStart)
    : [];

  const startHour = selection.hours[0];
  const endHour = selection.hours[selection.hours.length - 1] + 1;
  const dateStr = [
    selectedDate.getFullYear(),
    String(selectedDate.getMonth() + 1).padStart(2, "0"),
    String(selectedDate.getDate()).padStart(2, "0"),
  ].join("-");

  // Resolve the checkout_type to send to the API:
  // — multiple options: use the player's pick (null = not yet chosen, submit is blocked)
  // — one option: send it explicitly so the server doesn't have to guess
  // — no options: omit (instant-confirm)
  const resolvedPaymentOption: "P2P_AI" | "PAY_AT_VENUE" | "GATEWAY_SPLIT" | null =
    multipleOptions  ? selectedPaymentOption :
    acceptsQr        ? "P2P_AI"              :
    acceptsCash      ? "PAY_AT_VENUE"        :
    acceptsGateway   ? "GATEWAY_SPLIT"       :
    null;

  async function handleConfirm() {
    if (!user) return;
    setError("");
    setLoading(true);
    try {
      const res = await authedFetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          businessSlug,
          facilityId: selection!.facilityId,
          date: dateStr,
          hours: selection!.hours,
          ...(appliedCredit > 0 && { creditAmount: appliedCredit }),
          ...(resolvedPaymentOption && { checkout_type: resolvedPaymentOption }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.error === "SLOT_UNAVAILABLE") {
          setError("One or more slots you selected were just booked by someone else. Please pick a different time.");
        } else {
          setError("Failed to save booking. Please try again.");
        }
        return;
      }
      setBookingId(body.bookingId ?? null);

      if (body.checkout_type === "GATEWAY_SPLIT") {
        // Create the payment session and redirect — loading stays true until redirect
        try {
          const sessionRes = await authedFetch("/api/payments/create-session", {
            method: "POST",
            body: JSON.stringify({ bookingId: body.bookingId }),
          });
          const sessionBody = await sessionRes.json().catch(() => ({})) as { checkoutUrl?: string };
          if (!sessionRes.ok || !sessionBody.checkoutUrl) {
            setError("Could not prepare payment. Please try again.");
            return;
          }
          window.location.href = sessionBody.checkoutUrl;
        } catch {
          setError("Could not prepare payment. Please try again.");
        } finally {
          setLoading(false);
        }
        return;
      }

      setCheckoutType(
        body.checkout_type === "P2P_AI"       ? "P2P_AI"       :
        body.checkout_type === "PAY_AT_VENUE" ? "PAY_AT_VENUE" :
        "confirmed"
      );
    } catch {
      setError("Failed to save booking. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadProof() {
    if (!proofFile || !bookingId || !user) return;
    setUploadLoading(true);
    setUploadError("");
    try {
      const storageRef = ref(storage, `payment_proofs/${bookingId}/${Date.now()}_${proofFile.name}`);
      await uploadBytes(storageRef, proofFile);
      const proofUrl = await getDownloadURL(storageRef);
      const res = await authedFetch("/api/payments/submit-proof", {
        method: "POST",
        body: JSON.stringify({ bookingId, proofUrl }),
      });
      if (!res.ok) {
        setUploadError("Failed to submit proof. Please try again.");
        return;
      }
      setCheckoutType("P2P_submitted");
    } catch {
      setUploadError("Upload failed. Please check your connection and try again.");
    } finally {
      setUploadLoading(false);
    }
  }

  function handleClose() {
    const wasComplete = checkoutType !== null;
    setCheckoutType(null);
    setBookingId(null);
    setProofFile(null);
    setUploadError("");
    setError("");
    setUseCredits(false);
    setCreditBalance(0);
    setSelectedPaymentOption(null);
    onClose();
    if (wasComplete) onSuccess();
  }

  function headerTitle() {
    if (checkoutType === "confirmed")     return "Booking Confirmed!";
    if (checkoutType === "PAY_AT_VENUE")  return "Booking Confirmed!";
    if (checkoutType === "P2P_AI")        return "Slot Reserved!";
    if (checkoutType === "P2P_upload")    return "Upload Proof";
    if (checkoutType === "P2P_submitted") return "Proof Submitted!";
    if (checkoutType === "GATEWAY_SPLIT") return "Redirecting…";
    return "Confirm Booking";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

      <div data-testid="booking-modal" className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-gray-900">{headerTitle()}</h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400"
          >
            <X size={18} />
          </button>
        </div>

        {checkoutType === "confirmed" ? (
          /* Instant-confirm success */
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
            {bookingId && (
              <p className="text-xs text-gray-400 font-mono">
                Ref: {bookingId.slice(0, 8).toUpperCase()}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                }}
                className="flex-1 text-xs border border-gray-200 rounded-xl py-2 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                🔗 Copy link
              </button>
              <button
                onClick={handleClose}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: accentColor }}
              >
                Done
              </button>
            </div>
          </div>

        ) : checkoutType === "PAY_AT_VENUE" ? (
          /* Pay-at-venue — confirmed, remind customer to pay in person */
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
              <strong>{formatHour(endHour)}</strong> is confirmed.
            </p>
            <div className="bg-amber-50 rounded-2xl px-4 py-3 text-sm text-amber-800 font-semibold">
              Please pay at the venue on the day of your booking.
            </div>
            {bookingId && (
              <p className="text-xs text-gray-400 font-mono">
                Ref: {bookingId.slice(0, 8).toUpperCase()}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                }}
                className="flex-1 text-xs border border-gray-200 rounded-xl py-2 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                🔗 Copy link
              </button>
              <button
                onClick={handleClose}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: accentColor }}
              >
                Done
              </button>
            </div>
          </div>

        ) : checkoutType === "P2P_AI" ? (
          /* P2P QR screen — slot held, prompt to upload proof */
          <div className="px-6 pb-6 space-y-4">
            <div className="bg-blue-50 rounded-2xl p-3 text-center">
              <p className="text-xs font-semibold text-blue-700">
                Slot held for 24 hours — send payment to confirm
              </p>
            </div>
            {staticQrUrl ? (
              <div className="flex justify-center">
                <div className="border-2 border-gray-200 rounded-2xl p-2 bg-white">
                  <Image
                    src={staticQrUrl}
                    alt="GCash QR code"
                    width={200}
                    height={200}
                    className="rounded-xl"
                  />
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="w-[200px] h-[200px] border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-400">
                  <QrCode size={36} />
                  <p className="text-xs text-center px-4">Contact the venue for payment details</p>
                </div>
              </div>
            )}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{selection.facilityName}</span>
                <span className="font-semibold text-gray-900">
                  {selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{formatHour(startHour)} – {formatHour(endHour)}</span>
                <span className="font-black text-gray-900">₱{amountDue.toLocaleString()}</span>
              </div>
            </div>
            <button
              onClick={() => setCheckoutType("P2P_upload")}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              Next: Upload Proof →
            </button>
          </div>

        ) : checkoutType === "P2P_upload" ? (
          /* P2P upload step */
          <div className="px-6 pb-6 space-y-4">
            <p className="text-sm text-gray-500 leading-relaxed">
              Take a screenshot of your GCash receipt and upload it below. Your booking will be confirmed once the payment is verified.
            </p>

            {/* File picker */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed rounded-2xl p-5 flex flex-col items-center gap-2 transition-colors"
              style={proofFile
                ? { borderColor: accentColor, backgroundColor: `${accentColor}08` }
                : { borderColor: "#e5e7eb", backgroundColor: "#fafafa" }
              }
            >
              <Upload size={22} style={{ color: proofFile ? accentColor : "#9ca3af" }} />
              <span className="text-sm font-semibold" style={{ color: proofFile ? accentColor : "#6b7280" }}>
                {proofFile ? proofFile.name : "Tap to choose a photo"}
              </span>
              {proofFile && (
                <span className="text-xs text-gray-400">
                  {(proofFile.size / 1024).toFixed(0)} KB
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                setProofFile(e.target.files?.[0] ?? null);
                setUploadError("");
              }}
            />

            {uploadError && (
              <p className="text-xs font-medium text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                {uploadError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setCheckoutType("P2P_AI")}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleUploadProof}
                disabled={!proofFile || uploadLoading}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: accentColor }}
              >
                {uploadLoading ? "Uploading…" : "Submit proof"}
              </button>
            </div>
          </div>

        ) : checkoutType === "P2P_submitted" ? (
          /* Upload success */
          <div className="px-6 pb-8 text-center space-y-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-3xl"
              style={{ backgroundColor: `${accentColor}15` }}
            >
              ✅
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Your payment proof has been submitted. We&apos;ll verify it shortly and confirm your booking for{" "}
              <strong>{selection.facilityName}</strong> on{" "}
              <strong>
                {selectedDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </strong>.
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
          /* Booking form */
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
              {normalHours.length > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>
                    ₱{pricePerHour.toLocaleString()} × {normalHours.length} hr
                    {normalHours.length > 1 ? "s" : ""}
                  </span>
                  <span>₱{(pricePerHour * normalHours.length).toLocaleString()}</span>
                </div>
              )}
              {primeHours.length > 0 && primePricePerHour && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span className="flex items-center gap-1.5">
                    ₱{primePricePerHour.toLocaleString()} × {primeHours.length} hr
                    {primeHours.length > 1 ? "s" : ""}
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
                    >
                      Prime
                    </span>
                  </span>
                  <span>₱{(primePricePerHour * primeHours.length).toLocaleString()}</span>
                </div>
              )}

              {/* Credits row */}
              {creditBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setUseCredits((v) => !v)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-xl border transition-colors text-sm"
                  style={
                    useCredits
                      ? { borderColor: accentColor, backgroundColor: `${accentColor}08` }
                      : { borderColor: "#f3f4f6", backgroundColor: "#fafafa" }
                  }
                >
                  <span className="flex items-center gap-2 font-semibold" style={{ color: useCredits ? accentColor : "#6b7280" }}>
                    <Coins size={14} />
                    Use credits (₱{creditBalance.toLocaleString()} available)
                  </span>
                  <span className="font-bold" style={{ color: useCredits ? accentColor : "#9ca3af" }}>
                    {useCredits ? `−₱${appliedCredit.toLocaleString()}` : "Off"}
                  </span>
                </button>
              )}

              <div className="flex justify-between text-base font-black text-gray-900 pt-1.5 border-t border-gray-100">
                <span>Total due</span>
                <span>₱{amountDue.toLocaleString()}</span>
              </div>
              {appliedCredit > 0 && (
                <p className="text-xs text-gray-400 text-right">
                  ₱{appliedCredit.toLocaleString()} covered by credits
                </p>
              )}
            </div>

            {/* Payment method choice — shown only when multiple options are enabled */}
            {multipleOptions && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500">How would you like to pay?</p>
                {acceptsQr && (
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentOption("P2P_AI")}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-colors"
                    style={selectedPaymentOption === "P2P_AI"
                      ? { borderColor: accentColor, backgroundColor: `${accentColor}08` }
                      : { borderColor: "#e5e7eb", backgroundColor: "#fafafa" }}
                  >
                    <QrCode size={18} style={{ color: selectedPaymentOption === "P2P_AI" ? accentColor : "#9ca3af" }} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: selectedPaymentOption === "P2P_AI" ? accentColor : "#374151" }}>
                        Pay via GCash QR
                      </p>
                      <p className="text-xs text-gray-400">Upload your receipt after paying</p>
                    </div>
                  </button>
                )}
                {acceptsCash && (
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentOption("PAY_AT_VENUE")}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-colors"
                    style={selectedPaymentOption === "PAY_AT_VENUE"
                      ? { borderColor: accentColor, backgroundColor: `${accentColor}08` }
                      : { borderColor: "#e5e7eb", backgroundColor: "#fafafa" }}
                  >
                    <Banknote size={18} style={{ color: selectedPaymentOption === "PAY_AT_VENUE" ? accentColor : "#9ca3af" }} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: selectedPaymentOption === "PAY_AT_VENUE" ? accentColor : "#374151" }}>
                        Pay at Venue
                      </p>
                      <p className="text-xs text-gray-400">Bring cash on the day of your booking</p>
                    </div>
                  </button>
                )}
                {acceptsGateway && (
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentOption("GATEWAY_SPLIT")}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-colors"
                    style={selectedPaymentOption === "GATEWAY_SPLIT"
                      ? { borderColor: accentColor, backgroundColor: `${accentColor}08` }
                      : { borderColor: "#e5e7eb", backgroundColor: "#fafafa" }}
                  >
                    <CreditCard size={18} style={{ color: selectedPaymentOption === "GATEWAY_SPLIT" ? accentColor : "#9ca3af" }} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: selectedPaymentOption === "GATEWAY_SPLIT" ? accentColor : "#374151" }}>
                        Pay Online
                      </p>
                      <p className="text-xs text-gray-400">GCash, Maya, credit/debit card</p>
                    </div>
                  </button>
                )}
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
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || (multipleOptions && !selectedPaymentOption)}
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
