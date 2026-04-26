"use client";

import { Business } from "@/lib/types";
import { Booking } from "@/lib/firebase/bookings";

const SLOT_H = 64;
const COURT_W = 140;
const TIME_W = 60;

function parseHour(timeStr: string): number {
  const [time, period] = timeStr.split(" ");
  const h = parseInt(time.split(":")[0], 10);
  if (period === "AM") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

interface Props {
  business: Business;
  bookings: Booking[];
  date: Date;
  loading: boolean;
  selectedBookingId: string | null;
  onSelectBooking: (booking: Booking) => void;
}

export default function ScheduleGrid({
  business,
  bookings,
  date,
  loading,
  selectedBookingId,
  onSelectBooking,
}: Props) {
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
  const todayHours = business.operatingHours.find((h) => h.day === dayName);

  if (todayHours?.closed) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Closed today
      </div>
    );
  }

  const openHour = todayHours ? parseHour(todayHours.open) : 6;
  const closeHour = todayHours ? parseHour(todayHours.close) : 22;
  const hours = Array.from({ length: closeHour - openHour }, (_, i) => openHour + i);
  const gridH = hours.length * SLOT_H;
  const totalW = TIME_W + business.facilities.length * COURT_W;

  const byFacility = new Map<string, Booking[]>();
  business.facilities.forEach((f) => byFacility.set(f.id, []));
  bookings.forEach((b) => byFacility.get(b.facilityId)?.push(b));

  return (
    <div className="overflow-auto h-full">
      <div style={{ minWidth: totalW }}>

        {/* Court header — sticky top */}
        <div className="flex sticky top-0 z-20 bg-white border-b border-gray-200">
          <div
            className="shrink-0 sticky left-0 z-30 bg-white border-r border-gray-200"
            style={{ width: TIME_W }}
          />
          {business.facilities.map((f) => (
            <div
              key={f.id}
              className="shrink-0 border-l border-gray-100 flex items-center justify-center px-2 py-3"
              style={{ width: COURT_W }}
            >
              <span className="text-xs font-bold text-gray-700 text-center leading-tight">
                {f.name}
              </span>
            </div>
          ))}
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{
                borderColor: `${business.accentColor} transparent transparent transparent`,
              }}
            />
          </div>
        ) : (
          <div className="flex relative" style={{ height: gridH + 20 }}>

            {/* Time labels — sticky left */}
            <div
              className="shrink-0 sticky left-0 z-10 bg-white border-r border-gray-200 relative"
              style={{ width: TIME_W }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute w-full flex items-start justify-end pr-2 pt-1"
                  style={{ top: (h - openHour) * SLOT_H, height: SLOT_H }}
                >
                  <span className="text-[11px] text-gray-400 font-medium">
                    {formatHour(h)}
                  </span>
                </div>
              ))}
              {/* Closing time label */}
              <div
                className="absolute w-full flex items-start justify-end pr-2 pt-1"
                style={{ top: gridH }}
              >
                <span className="text-[11px] text-gray-400 font-medium">
                  {formatHour(closeHour)}
                </span>
              </div>
            </div>

            {/* Court columns */}
            {business.facilities.map((f) => {
              const fBookings = byFacility.get(f.id) ?? [];
              return (
                <div
                  key={f.id}
                  className="shrink-0 border-l border-gray-100 relative"
                  style={{ width: COURT_W, height: gridH }}
                >
                  {/* Hour grid lines */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-b border-gray-50"
                      style={{ top: (h - openHour) * SLOT_H, height: SLOT_H }}
                    />
                  ))}

                  {/* Booking blocks */}
                  {fBookings.map((b) => {
                    const selected = b.id === selectedBookingId;
                    return (
                      <button
                        key={b.id}
                        onClick={() => onSelectBooking(b)}
                        className="absolute left-1 right-1 rounded-lg overflow-hidden text-left transition-shadow"
                        style={{
                          top: (b.hours[0] - openHour) * SLOT_H + 2,
                          height: b.hours.length * SLOT_H - 4,
                          backgroundColor: selected
                            ? business.accentColor
                            : `${business.accentColor}20`,
                          borderLeft: `3px solid ${business.accentColor}`,
                          boxShadow: selected ? `0 0 0 2px ${business.accentColor}` : "none",
                        }}
                      >
                        <div className="p-1.5">
                          <p
                            className="text-xs font-bold truncate leading-tight"
                            style={{ color: selected ? "white" : business.accentColor }}
                          >
                            {b.userName}
                          </p>
                          {b.hours.length > 1 && (
                            <p
                              className="text-[10px] truncate mt-0.5"
                              style={{
                                color: selected ? "rgba(255,255,255,0.75)" : "#6b7280",
                              }}
                            >
                              ₱{b.totalPrice.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
