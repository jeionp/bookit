"use client";

import { X, CalendarDays, Clock, User, Mail, Hash } from "lucide-react";
import { Booking } from "@/lib/firebase/bookings";

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

interface Props {
  booking: Booking;
  accentColor: string;
  onClose: () => void;
}

export default function BookingDetailPanel({ booking, accentColor, onClose }: Props) {
  const startHour = booking.hours[0];
  const endHour = booking.hours[booking.hours.length - 1] + 1;

  return (
    <div data-testid="booking-detail-panel" className="w-72 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-900">Booking Detail</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        <span
          className="inline-block text-xs font-bold px-3 py-1 rounded-full"
          style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
        >
          Confirmed
        </span>

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
      </div>
    </div>
  );
}
