"use client";

import { useState, useEffect } from "react";
import { X, CalendarDays, Clock, User, Mail, Hash, History } from "lucide-react";
import {
  Booking,
  BookingStatus,
  PaymentStatusV2,
  getCustomerHistory,
} from "@/lib/firebase/bookings";
import { Business } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { formatHour } from "@/lib/slots";
import RescheduleWizard from "./RescheduleWizard";
import PaymentActionsSection from "./PaymentActionsSection";
import BookingCancelSection from "./BookingCancelSection";

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function PaymentBadge({ status }: { status?: "unpaid" | "paid" | "refunded" | "credited" | "refund_pending" }) {
  if (!status || status === "unpaid") return null;
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    paid:           { bg: "#f0fdf4", color: "#16a34a", label: "Paid" },
    refunded:       { bg: "#fef9c3", color: "#854d0e", label: "Refunded" },
    credited:       { bg: "#fef3c7", color: "#d97706", label: "Credited" },
    refund_pending: { bg: "#fef9c3", color: "#b45309", label: "Refund Pending" },
  };
  const style = styles[status];
  if (!style) return null;
  return (
    <span
      className="inline-block text-xs font-bold px-3 py-1 rounded-full"
      style={{ backgroundColor: style.bg, color: style.color }}
      data-testid="payment-badge"
    >
      {style.label}
    </span>
  );
}

function BookingStatusBadge({ status, accentColor }: { status: BookingStatus; accentColor: string }) {
  const cfg: Record<BookingStatus, { bg: string; color: string; label: string }> = {
    confirmed:  { bg: `${accentColor}15`, color: accentColor, label: "Confirmed" },
    slot_held:  { bg: "#fef3c7",          color: "#d97706",  label: "Slot Held" },
    expired:    { bg: "#f3f4f6",          color: "#6b7280",  label: "Expired" },
    cancelled:  { bg: "#fef2f2",          color: "#ef4444",  label: "Cancelled" },
  };
  const { bg, color, label } = cfg[status] ?? cfg.confirmed;
  return (
    <span className="inline-block text-xs font-bold px-3 py-1 rounded-full" style={{ backgroundColor: bg, color }}>
      {label}
    </span>
  );
}

function PaymentStatusV2Badge({ status }: { status?: PaymentStatusV2 | null }) {
  if (!status) return null;
  const cfg: Partial<Record<PaymentStatusV2, { bg: string; color: string; label: string }>> = {
    pending_proof: { bg: "#eff6ff", color: "#2563eb", label: "Awaiting Proof" },
    ai_review:     { bg: "#fef3c7", color: "#d97706", label: "Under Review" },
    paid:          { bg: "#f0fdf4", color: "#16a34a", label: "Paid" },
    rejected:      { bg: "#fef2f2", color: "#dc2626", label: "Proof Rejected" },
    pending_cash:  { bg: "#f5f3ff", color: "#7c3aed", label: "Pay at Venue" },
  };
  const style = cfg[status];
  if (!style) return null;
  return (
    <span
      className="inline-block text-xs font-bold px-3 py-1 rounded-full"
      style={{ backgroundColor: style.bg, color: style.color }}
      data-testid="payment-status-v2-badge"
    >
      {style.label}
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
  const { user } = useAuth();
  const startHour = booking.hours[0];
  const endHour = booking.hours[booking.hours.length - 1] + 1;

  const [localStatus, setLocalStatus] = useState<BookingStatus>(booking.status);
  const [localPaymentStatus, setLocalPaymentStatus] = useState<PaymentStatusV2 | undefined>(
    booking.payment_status_v2
  );
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [history, setHistory] = useState<Booking[]>([]);

  useEffect(() => {
    getCustomerHistory(business.slug, booking.userEmail, booking.id).then(setHistory);
  }, [business.slug, booking.userEmail, booking.id]);

  function handleStatusChange(paymentStatus: PaymentStatusV2 | undefined, bookingStatus?: BookingStatus) {
    setLocalPaymentStatus(paymentStatus);
    if (bookingStatus) setLocalStatus(bookingStatus);
  }

  function openReschedule() {
    setRescheduleMode(true);
  }

  function exitReschedule() {
    setRescheduleMode(false);
  }

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
          <RescheduleWizard
            booking={booking}
            business={business}
            accentColor={accentColor}
            onExit={exitReschedule}
            onReschedule={(updated) => { setRescheduleMode(false); onReschedule(updated); }}
          />
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <BookingStatusBadge status={localStatus} accentColor={accentColor} />
              <PaymentBadge status={booking.paymentStatus} />
              <PaymentStatusV2Badge status={localPaymentStatus} />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Facility</p>
              <p className="text-sm font-bold text-gray-900">{booking.facilityName}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Date & Time</p>
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Customer</p>
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Total</p>
              <p className="text-2xl font-black text-gray-900">₱{booking.totalPrice.toLocaleString()}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Booking ID</p>
              <div className="flex items-start gap-1.5 text-xs text-gray-400 font-mono break-all">
                <Hash size={11} className="text-gray-300 shrink-0 mt-0.5" />
                {booking.id}
              </div>
            </div>

            {history.length > 0 && (
              <div data-testid="customer-history">
                <div className="flex items-center gap-1.5 mb-2">
                  <History size={13} className="text-gray-400 shrink-0" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Past bookings</p>
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

            {booking.proof_url && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Payment Proof</p>
                <a href={booking.proof_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={booking.proof_url}
                    alt="Payment proof"
                    className="w-full rounded-xl border border-gray-200 object-cover"
                    data-testid="proof-image"
                  />
                </a>
              </div>
            )}

            <PaymentActionsSection
              booking={booking}
              user={user}
              localPaymentStatus={localPaymentStatus}
              onStatusChange={handleStatusChange}
            />

            <BookingCancelSection
              booking={booking}
              isPaid={booking.paymentStatus === "paid"}
              onOpenReschedule={openReschedule}
              onCancel={onCancel}
            />
          </>
        )}
      </div>
    </div>
  );
}
