"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Business } from "@/lib/types";
import { Booking, getAllBookingsForDay } from "@/lib/firebase/bookings";
import { useAuth } from "@/context/AuthContext";
import ScheduleGrid from "./ScheduleGrid";
import BookingDetailPanel from "./BookingDetailPanel";

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatNavDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminScheduleView({ business }: { business: Business }) {
  const { signOut } = useAuth();
  const [date, setDate] = useState(() => new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedBooking(null);
    getAllBookingsForDay(business.slug, toDateString(date))
      .then(setBookings)
      .finally(() => setLoading(false));
  }, [business.slug, date]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shrink-0 h-14 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-black tracking-tight text-gray-900">bookit</span>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-600">{business.name}</span>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${business.accentColor}15`, color: business.accentColor }}
          >
            Admin
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${business.slug}`}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ExternalLink size={13} />
            Public view
          </Link>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>

      {/* Date navigation */}
      <div className="bg-white border-b border-gray-100 shrink-0 px-4 py-2.5 flex items-center justify-between">
        <button
          onClick={() => setDate((d) => addDays(d, -1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          aria-label="Previous day"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-bold text-gray-900">{formatNavDate(date)}</span>
        <button
          onClick={() => setDate((d) => addDays(d, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          aria-label="Next day"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Body: grid + panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ScheduleGrid
            business={business}
            bookings={bookings}
            date={date}
            loading={loading}
            selectedBookingId={selectedBooking?.id ?? null}
            onSelectBooking={setSelectedBooking}
          />
        </div>
        {selectedBooking && (
          <BookingDetailPanel
            booking={selectedBooking}
            accentColor={business.accentColor}
            onClose={() => setSelectedBooking(null)}
          />
        )}
      </div>
    </div>
  );
}
