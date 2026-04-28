"use client";

import { useEffect, useState, useRef } from "react";
import { Business } from "@/lib/types";
import { Booking, getBookingsInRange } from "@/lib/firebase/bookings";

type Period = "today" | "week" | "month" | "ytd";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week:  "This Week",
  month: "This Month",
  ytd:   "Year to Date",
};

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getRangeDates(period: Period): { start: string; end: string } {
  const today = new Date();
  const end = toDateStr(today);
  if (period === "today") return { start: end, end };
  if (period === "week") {
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const start = new Date(today);
    start.setDate(today.getDate() + diff);
    return { start: toDateStr(start), end };
  }
  if (period === "month") {
    return { start: toDateStr(new Date(today.getFullYear(), today.getMonth(), 1)), end };
  }
  return { start: toDateStr(new Date(today.getFullYear(), 0, 1)), end };
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function computeStats(bookings: Booking[], business: Business) {
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const cancelled  = bookings.filter((b) => b.status === "cancelled");

  const revenue = confirmed.reduce((s, b) => s + b.totalPrice, 0);
  const bookingCount = confirmed.length;
  const totalHours = confirmed.reduce((s, b) => s + b.hours.length, 0);
  const avgBookingValue = bookingCount > 0 ? Math.round(revenue / bookingCount) : 0;
  const cancellationRate = bookings.length > 0 ? cancelled.length / bookings.length : 0;

  const courtMap = new Map(
    business.facilities.map((f) => [f.id, { name: f.name, count: 0, hours: 0 }])
  );
  confirmed.forEach((b) => {
    const entry = courtMap.get(b.facilityId);
    if (entry) { entry.count++; entry.hours += b.hours.length; }
  });
  const courtUtilization = [...courtMap.values()];

  const hourCounts = new Map<number, number>();
  confirmed.forEach((b) => b.hours.forEach((h) => hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1)));
  const peakHours = Array.from(hourCounts.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  return { revenue, bookingCount, totalHours, avgBookingValue, cancellationRate, courtUtilization, peakHours };
}

export default function AdminAnalyticsView({ business }: { business: Business }) {
  const { accentColor } = business;
  const [period, setPeriod] = useState<Period>("month");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  function loadData(p: Period) {
    const reqId = ++reqRef.current;
    const { start, end } = getRangeDates(p);
    getBookingsInRange(business.slug, start, end).then((data) => {
      if (reqId !== reqRef.current) return;
      setBookings(data);
      setLoading(false);
    });
  }

  useEffect(() => {
    loadData(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePeriod(p: Period) {
    setLoading(true);
    setPeriod(p);
    loadData(p);
  }

  const stats = computeStats(bookings, business);
  const maxCourtHours = Math.max(...stats.courtUtilization.map((c) => c.hours), 1);
  const maxHourCount  = Math.max(...stats.peakHours.map((h) => h.count), 1);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Period selector */}
        <div className="flex gap-1.5 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {(["today", "week", "month", "ytd"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePeriod(p)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              style={
                period === p
                  ? { backgroundColor: accentColor, color: "white" }
                  : { color: "#6b7280" }
              }
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div
              className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: `${accentColor} transparent transparent transparent` }}
            />
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Revenue" value={`₱${stats.revenue.toLocaleString()}`} testId="stat-revenue" />
              <StatCard label="Bookings" value={String(stats.bookingCount)} testId="stat-bookings" />
              <StatCard label="Hours Booked" value={String(stats.totalHours)} testId="stat-hours" />
              <StatCard
                label="Cancellation Rate"
                value={`${Math.round(stats.cancellationRate * 100)}%`}
                muted={stats.cancellationRate > 0.15}
                testId="stat-cancellation-rate"
              />
            </div>

            {/* Avg booking value */}
            {stats.bookingCount > 0 && (
              <p className="text-xs text-gray-400">
                Avg booking value:{" "}
                <span className="font-bold text-gray-700">₱{stats.avgBookingValue.toLocaleString()}</span>
              </p>
            )}

            {stats.bookingCount === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
                <p className="text-sm font-semibold text-gray-600">No bookings in this period</p>
                <p className="text-xs text-gray-400 mt-1">Try selecting a wider range</p>
              </div>
            ) : (
              <>
                {/* Court utilization */}
                <section className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">
                    Court Utilization
                  </h3>
                  <div className="space-y-3">
                    {stats.courtUtilization.map((c) => (
                      <div key={c.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-700">{c.name}</span>
                          <span className="text-xs text-gray-400">{c.hours}h · {c.count} booking{c.count !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(c.hours / maxCourtHours) * 100}%`,
                              backgroundColor: accentColor,
                              opacity: c.hours === 0 ? 0.15 : 1,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Peak hours heatmap */}
                {stats.peakHours.length > 0 && (
                  <section className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">
                      Peak Hours
                    </h3>
                    <div className="space-y-2">
                      {stats.peakHours.map(({ hour, count }) => (
                        <div key={hour} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-gray-500 w-12 text-right shrink-0">
                            {formatHour(hour)}
                          </span>
                          <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full rounded transition-all duration-500 flex items-center px-2"
                              style={{
                                width: `${(count / maxHourCount) * 100}%`,
                                backgroundColor: `${accentColor}30`,
                                minWidth: 32,
                              }}
                            >
                              <span className="text-[10px] font-bold" style={{ color: accentColor }}>
                                {count}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  muted = false,
  testId,
}: {
  label: string;
  value: string;
  muted?: boolean;
  testId?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4" data-testid={testId}>
      <p className="text-xs font-semibold text-gray-400 mb-1">{label}</p>
      <p
        className="text-2xl font-black"
        style={{ color: muted ? "#ef4444" : "#111827" }}
      >
        {value}
      </p>
    </div>
  );
}
