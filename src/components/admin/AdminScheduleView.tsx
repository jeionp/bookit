"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Plus } from "lucide-react";
import { Business } from "@/lib/types";
import { Booking, getAllBookingsForDay } from "@/lib/firebase/bookings";
import ScheduleGrid from "./ScheduleGrid";
import BookingDetailPanel from "./BookingDetailPanel";
import WalkInModal from "./WalkInModal";

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
  const [date, setDate] = useState(() => new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [search, setSearch] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getAllBookingsForDay(business.slug, toDateString(date)).then((data) => {
      if (!active) return;
      setBookings(data);
      setLoading(false);
    });
    return () => { active = false; };
  }, [business.slug, date]);

  function navigate(days: number) {
    setLoading(true);
    setSelectedBooking(null);
    setDate((d) => addDays(d, days));
  }

  function handleAdminCancel() {
    if (!selectedBooking) return;
    setBookings((prev) => prev.filter((b) => b.id !== selectedBooking.id));
    setSelectedBooking(null);
  }

  function handleWalkInBooked() {
    setWalkInOpen(false);
    setLoading(true);
    getAllBookingsForDay(business.slug, toDateString(date)).then((data) => {
      setBookings(data);
      setLoading(false);
    });
  }

  function handleReschedule(updated: Booking) {
    const dateStr = toDateString(date);
    if (updated.date === dateStr) {
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setSelectedBooking(updated);
    } else {
      setBookings((prev) => prev.filter((b) => b.id !== updated.id));
      setSelectedBooking(null);
    }
  }

  const filteredBookings = search.trim()
    ? bookings.filter(
        (b) =>
          b.userName.toLowerCase().includes(search.toLowerCase()) ||
          b.userEmail.toLowerCase().includes(search.toLowerCase())
      )
    : bookings;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Date navigation */}
      <div className="bg-white border-b border-gray-100 shrink-0 px-4 py-2.5 flex items-center justify-between gap-2">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          aria-label="Previous day"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-bold text-gray-900">{formatNavDate(date)}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
            aria-label="Next day"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setWalkInOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors ml-1"
            style={{ backgroundColor: business.accentColor }}
            aria-label="New walk-in booking"
            data-testid="new-walkin-btn"
          >
            <Plus size={13} />
            New booking
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-white border-b border-gray-100 shrink-0 px-4 py-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search bookings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
            style={{ "--tw-ring-color": business.accentColor } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Body: grid + panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ScheduleGrid
            business={business}
            bookings={filteredBookings}
            date={date}
            loading={loading}
            selectedBookingId={selectedBooking?.id ?? null}
            onSelectBooking={setSelectedBooking}
          />
        </div>
        {selectedBooking && (
          <BookingDetailPanel
            key={selectedBooking.id}
            booking={selectedBooking}
            business={business}
            onClose={() => setSelectedBooking(null)}
            onCancel={handleAdminCancel}
            onReschedule={handleReschedule}
          />
        )}
      </div>

      {walkInOpen && (
        <WalkInModal
          business={business}
          initialDate={toDateString(date)}
          onClose={() => setWalkInOpen(false)}
          onBooked={handleWalkInBooked}
        />
      )}
    </div>
  );
}
