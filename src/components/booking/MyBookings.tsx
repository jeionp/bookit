"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { Booking, getUserBookings } from "@/lib/firebase/bookings";
import { useAuth } from "@/context/AuthContext";
import CancelBookingModal from "@/components/booking/CancelBookingModal";

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isBookingPast(booking: Booking): boolean {
  const now = new Date();
  const [y, m, d] = booking.date.split("-").map(Number);
  const bookingDay = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (bookingDay < today) return true;
  if (bookingDay > today) return false;
  return now.getHours() >= booking.hours[booking.hours.length - 1] + 1;
}

export default function MyBookings({ accentColor }: { accentColor: string }) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(!!user);
  const [fetchError, setFetchError] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserBookings(user.uid)
      .then(setBookings)
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [user]);

  function handleCancelled(bookingId: string) {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" } : b)),
    );
  }

  if (!user) {
    return (
      <div className="py-16 text-center space-y-2">
        <p className="text-sm font-semibold text-gray-700">Sign in to view your bookings</p>
        <p className="text-xs text-gray-400">Your confirmed bookings will appear here</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center">
        <div
          className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: `${accentColor} transparent transparent transparent` }}
        />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="py-16 text-center space-y-2">
        <p className="text-sm font-semibold text-gray-700">Couldn&apos;t load bookings</p>
        <p className="text-xs text-gray-400">Please try refreshing the page</p>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="py-16 text-center space-y-2">
        <CalendarDays size={32} className="mx-auto text-gray-200" />
        <p className="text-sm font-semibold text-gray-700">No bookings yet</p>
        <p className="text-xs text-gray-400">
          Head to the Home tab to check availability and book a slot
        </p>
      </div>
    );
  }

  const upcoming  = bookings.filter((b) => b.status === "confirmed" && !isBookingPast(b));
  const completed = bookings.filter((b) => b.status === "confirmed" &&  isBookingPast(b));
  const cancelled = bookings.filter((b) => b.status === "cancelled");

  return (
    <>
      <div className="space-y-6 pb-6">
        {upcoming.length > 0 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
              Upcoming
            </h3>
            <div className="space-y-3">
              {upcoming.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  accentColor={accentColor}
                  variant="upcoming"
                  onCancel={() => setCancelTarget(booking)}
                />
              ))}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
              Completed
            </h3>
            <div className="space-y-3 opacity-60">
              {completed.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  accentColor={accentColor}
                  variant="completed"
                />
              ))}
            </div>
          </section>
        )}

        {cancelled.length > 0 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
              Cancelled
            </h3>
            <div className="space-y-3 opacity-60">
              {cancelled.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  accentColor={accentColor}
                  variant="cancelled"
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <CancelBookingModal
        open={!!cancelTarget}
        booking={cancelTarget}
        accentColor={accentColor}
        onClose={() => setCancelTarget(null)}
        onCancelled={(id) => {
          handleCancelled(id);
          setCancelTarget(null);
        }}
      />
    </>
  );
}

const BADGE: Record<string, { label: string; style: React.CSSProperties }> = {
  upcoming:  { label: "Confirmed", style: {} },
  completed: { label: "Completed", style: { backgroundColor: "#f3f4f6", color: "#6b7280" } },
  cancelled: { label: "Cancelled", style: { backgroundColor: "#f3f4f6", color: "#9ca3af" } },
};

function BookingCard({
  booking,
  accentColor,
  variant,
  onCancel,
}: {
  booking: Booking;
  accentColor: string;
  variant: "upcoming" | "completed" | "cancelled";
  onCancel?: () => void;
}) {
  const startHour = booking.hours[0];
  const endHour = booking.hours[booking.hours.length - 1] + 1;
  const badge = BADGE[variant];
  const barColor = variant === "upcoming" ? accentColor : "#d1d5db";
  const badgeStyle = variant === "upcoming"
    ? { backgroundColor: `${accentColor}15`, color: accentColor }
    : badge.style;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="h-1" style={{ backgroundColor: barColor }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 min-w-0">
            <div>
              <p className="text-sm font-bold text-gray-900 truncate">{booking.facilityName}</p>
              <p className="text-xs text-gray-500">{booking.businessName}</p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <CalendarDays size={12} className="text-gray-400" />
                {formatDate(booking.date)}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-gray-400" />
                {formatHour(startHour)} – {formatHour(endHour)}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-base font-black text-gray-900">
              ₱{booking.totalPrice.toLocaleString()}
            </p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={badgeStyle}>
              {badge.label}
            </span>
          </div>
        </div>

        {variant === "upcoming" && onCancel && (
          <button
            onClick={onCancel}
            className="mt-3 text-xs font-semibold text-red-400 hover:text-red-600 transition-colors"
          >
            Cancel booking
          </button>
        )}
      </div>
    </div>
  );
}
