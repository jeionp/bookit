"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Sunrise, Sun, Moon } from "lucide-react";
import { DayPicker, useDayPicker } from "react-day-picker";
import type { MonthCaptionProps } from "react-day-picker";
import "react-day-picker/src/style.css";
import { Business, Facility } from "@/lib/types";
import { getBookedHours } from "@/lib/firebase/bookings";

// ─── helpers ────────────────────────────────────────────────────────────────

function toDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function parseHour(timeStr: string): number {
  const [time, period] = timeStr.split(" ");
  let hour = parseInt(time.split(":")[0]);
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour;
}

function generateSlots(open: string, close: string): number[] {
  const slots: number[] = [];
  for (let h = parseHour(open); h < parseHour(close); h++) slots.push(h);
  return slots;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatRange(hours: number[]): string {
  if (hours.length === 0) return "";
  return `${formatHour(hours[0])} – ${formatHour(hours[hours.length - 1] + 1)}`;
}

// Walk from startHour toward endHour, stopping before the first booked slot.
function getValidRange(
  startHour: number,
  endHour: number,
  bookedHours: number[]
): number[] {
  const step = startHour <= endHour ? 1 : -1;
  const hours: number[] = [];
  for (let h = startHour; step > 0 ? h <= endHour : h >= endHour; h += step) {
    if (bookedHours.includes(h)) break;
    hours.push(h);
  }
  return step > 0 ? hours : hours.reverse();
}

// ─── period grouping ─────────────────────────────────────────────────────────

const PERIODS = [
  { key: "morning",   label: "Morning",   icon: Sunrise, range: (h: number) => h < 12 },
  { key: "afternoon", label: "Afternoon", icon: Sun,     range: (h: number) => h >= 12 && h < 17 },
  { key: "evening",   label: "Evening",   icon: Moon,    range: (h: number) => h >= 17 },
] as const;

function groupByPeriod(slots: number[]) {
  return PERIODS.map((p) => ({ ...p, slots: slots.filter(p.range) })).filter(
    (p) => p.slots.length > 0
  );
}

// ─── custom month caption ─────────────────────────────────────────────────────

function MonthCaption({ calendarMonth }: MonthCaptionProps) {
  const { nextMonth, previousMonth, goToMonth } = useDayPicker();
  return (
    <div className="flex items-center justify-between px-1 mb-3">
      <button
        aria-label="Go to previous month"
        onClick={() => previousMonth && goToMonth(previousMonth)}
        disabled={!previousMonth}
        className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-bold text-gray-900">
        {calendarMonth.date.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
      </span>
      <button
        aria-label="Go to next month"
        onClick={() => nextMonth && goToMonth(nextMonth)}
        disabled={!nextMonth}
        className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ─── types ───────────────────────────────────────────────────────────────────

interface Selection {
  facilityId: string;
  facilityName: string;
  hours: number[];
  pricePerHour: number;
  primePricePerHour?: number;
  primeTimeStart?: number;
  totalPrice: number;
}

interface DragState {
  facilityId: string;
  facilityName: string;
  startHour: number;
  currentHour: number;
  pricePerHour: number;
  primePricePerHour?: number;
  primeTimeStart?: number;
}

// ─── component ───────────────────────────────────────────────────────────────

export type { Selection };

export default function AvailabilitySection({
  business,
  onBook,
  selectedFacilityId,
  onFacilityChange,
}: {
  business: Business;
  onBook: (selection: Selection, date: Date) => void;
  selectedFacilityId: string;
  onFacilityChange: (id: string) => void;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [bookedHours, setBookedHours] = useState<number[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const prevSelectionRef = useRef<Selection | null>(null);

  const facility: Facility =
    business.facilities.find((f) => f.id === selectedFacilityId) ??
    business.facilities[0];

  const dateKey = toDateKey(selectedDate);
  const isToday = dateKey === toDateKey(today);
  const dayName = selectedDate.toLocaleDateString("en-US", { weekday: "long" });
  const todayHours = business.operatingHours.find((h) => h.day === dayName);
  const slots =
    todayHours && !todayHours.closed
      ? generateSlots(todayHours.open, todayHours.close)
      : [];

  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 30);
    return d;
  }, [today]);

  // Fetch real booked hours whenever facility or date changes.
  // loadedKey tracks which facility+date the current bookedHours belongs to;
  // when it differs from the current fetchKey we show a loading state.
  const fetchKey = `${facility.id}:${dateKey}`;
  const loadingSlots = loadedKey !== fetchKey;

  useEffect(() => {
    let cancelled = false;
    getBookedHours(business.slug, facility.id, dateKey)
      .then((hours) => {
        if (!cancelled) {
          setBookedHours(hours);
          setLoadedKey(`${facility.id}:${dateKey}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBookedHours([]);
          setLoadedKey(`${facility.id}:${dateKey}`);
        }
      });
    return () => { cancelled = true; };
  }, [facility.id, dateKey, business.slug]);

  // Derive active selection — discard it if it belongs to a different facility
  const activeSelection =
    selection?.facilityId === facility.id ? selection : null;

  const previewHours = drag
    ? getValidRange(drag.startHour, drag.currentHour, bookedHours)
    : [];

  // Close calendar on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    }
    if (calendarOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [calendarOpen]);

  // Track drag position via document mousemove — more reliable than onMouseEnter
  // on individual buttons in headless browsers where synthetic events may not
  // trigger mouseenter on child elements during a programmatic drag.
  useEffect(() => {
    if (!drag) return;
    function handleMouseMove(e: MouseEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const btn = el?.closest("[data-slot-hour]");
      if (!btn) return;
      const hour = parseInt(btn.getAttribute("data-slot-hour") ?? "", 10);
      if (!isNaN(hour)) {
        setDrag((d) => (d ? { ...d, currentHour: hour } : null));
      }
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [drag]);

  // Finalize drag selection on mouseup anywhere in the document
  useEffect(() => {
    function handleMouseUp() {
      if (!drag) return;
      const hours = getValidRange(drag.startHour, drag.currentHour, bookedHours);
      setDrag(null);

      if (hours.length === 0) return;

      const prev = prevSelectionRef.current;
      if (
        hours.length === 1 &&
        prev?.facilityId === drag.facilityId &&
        prev.hours.length === 1 &&
        prev.hours[0] === hours[0]
      ) {
        setSelection(null);
        return;
      }

      const { pricePerHour, primePricePerHour, primeTimeStart } = drag;
      const totalPrice = hours.reduce((sum, h) => {
        const isPrime = primePricePerHour && primeTimeStart && h >= primeTimeStart;
        return sum + (isPrime ? primePricePerHour : pricePerHour);
      }, 0);
      setSelection({
        facilityId: drag.facilityId,
        facilityName: drag.facilityName,
        hours,
        pricePerHour,
        primePricePerHour,
        primeTimeStart,
        totalPrice,
      });
    }

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [drag, bookedHours, selection]);

  function handleSlotMouseDown(hour: number) {
    if (bookedHours.includes(hour)) return;
    prevSelectionRef.current = selection; // capture before the state update clears it
    setSelection(null);
    setDrag({
      facilityId: facility.id,
      facilityName: facility.name,
      startHour: hour,
      currentHour: hour,
      pricePerHour: facility.pricePerHour,
      primePricePerHour: facility.primePricePerHour,
      primeTimeStart: facility.primeTimeStart,
    });
  }

  function selectDate(date: Date | undefined) {
    if (!date) return;
    setSelectedDate(date);
    setCalendarOpen(false);
  }

  function slotState(hour: number): "active" | "preview" | "available" | "booked" {
    if (bookedHours.includes(hour)) return "booked";
    if (drag?.facilityId === facility.id && previewHours.includes(hour)) return "preview";
    if (!drag && activeSelection?.hours.includes(hour))
      return "active";
    return "available";
  }

  const totalPrice = activeSelection?.totalPrice ?? 0;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Check Availability</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Click a slot or drag across slots to select a time range
        </p>
      </div>

      {/* Date selector */}
      <div className="relative" ref={calendarRef}>
        <button
          onClick={() => setCalendarOpen((o) => !o)}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl border-2 bg-white transition-all hover:shadow-sm"
          style={{ borderColor: calendarOpen ? business.accentColor : "#e5e7eb" }}
        >
          <span
            className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
            style={{ backgroundColor: `${business.accentColor}18` }}
          >
            <CalendarDays size={18} style={{ color: business.accentColor }} />
          </span>
          <div className="flex-1 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {isToday ? "Today" : dayName}
            </p>
            <p className="text-base font-bold text-gray-900 leading-tight">
              {selectedDate.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <ChevronRight
            size={16}
            className="text-gray-400 transition-transform shrink-0"
            style={{ transform: calendarOpen ? "rotate(90deg)" : "rotate(0deg)" }}
          />
        </button>

        {calendarOpen && (
          <div
            className="absolute top-full left-0 mt-2 z-40 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden w-fit"
            style={{ "--rdp-accent-color": business.accentColor } as React.CSSProperties}
          >
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={selectDate}
              disabled={{ before: today, after: maxDate }}
              showOutsideDays={false}
              components={{ MonthCaption }}
              classNames={{
                root: "p-4",
                month_caption: "",
                caption_label: "hidden",
                nav: "hidden",
                month_grid: "w-full border-collapse",
                weekdays: "flex mb-1",
                weekday:
                  "flex-1 text-center text-[11px] font-semibold text-gray-400 uppercase py-1",
                week: "flex",
                day: "flex-1 aspect-square flex items-center justify-center",
                day_button:
                  "w-9 h-9 rounded-xl text-sm font-medium transition-all hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed",
                selected:
                  "!bg-[var(--rdp-accent-color)] !text-white rounded-xl font-bold hover:opacity-90",
                today: "font-bold text-[var(--rdp-accent-color)]",
                outside: "opacity-0 pointer-events-none",
                disabled: "opacity-25 cursor-not-allowed",
              }}
            />
          </div>
        )}
      </div>

      {/* Court tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
        {business.facilities.map((f) => {
          const active = f.id === selectedFacilityId;
          return (
            <button
              key={f.id}
              onClick={() => onFacilityChange(f.id)}
              className="shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap"
              style={
                active
                  ? { backgroundColor: business.accentColor, color: "white" }
                  : { backgroundColor: "#f3f4f6", color: "#6b7280" }
              }
            >
              {f.name}
            </button>
          );
        })}
      </div>

      {/* Slot grid */}
      {slots.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Closed on this day</p>
      ) : (
        <div className="space-y-5 select-none">
          {/* Selected court header */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">{facility.name}</span>
            <span className="text-sm font-semibold" style={{ color: business.accentColor }}>
              {facility.primePricePerHour ? "from " : ""}
              ₱{facility.pricePerHour.toLocaleString()}
              <span className="font-normal text-gray-400">/hr</span>
            </span>
          </div>

          {loadingSlots ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm text-gray-400">
              <span
                className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: `${business.accentColor}40`, borderTopColor: "transparent" }}
              />
              Loading availability…
            </div>
          ) : (
            groupByPeriod(slots).map(({ key, label, icon: Icon, slots: periodSlots }) => (
              <div key={key}>
                <div className="flex items-center gap-1.5 mb-3">
                  <Icon size={12} className="text-gray-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {label}
                  </span>
                  {key === "evening" && facility.primePricePerHour && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${business.accentColor}18`,
                        color: business.accentColor,
                      }}
                    >
                      Prime · ₱{facility.primePricePerHour.toLocaleString()}/hr
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2.5">
                  {periodSlots.map((hour) => {
                    const state = slotState(hour);
                    const unavailable = state === "booked";

                    let cls =
                      "h-9 rounded-xl text-[11px] font-semibold transition-colors border-2 flex items-center justify-center w-full ";
                    let style: React.CSSProperties = {};

                    if (state === "active") {
                      cls += "text-white border-transparent cursor-pointer";
                      style = { backgroundColor: business.accentColor, borderColor: business.accentColor };
                    } else if (state === "preview") {
                      cls += "text-white border-transparent cursor-pointer";
                      style = { backgroundColor: business.accentColor, opacity: 0.6 };
                    } else if (state === "available") {
                      cls += "border-transparent cursor-pointer hover:brightness-95";
                      style = { backgroundColor: `${business.accentColor}20`, color: business.accentColor };
                    } else {
                      cls += "border-transparent cursor-not-allowed text-gray-400";
                      style = { backgroundColor: "#f3f4f6" };
                    }

                    return (
                      <button
                        key={hour}
                        data-slot-hour={hour}
                        disabled={unavailable}
                        onMouseDown={() => handleSlotMouseDown(hour)}
                        className={cls}
                        style={style}
                        draggable={false}
                      >
                        {state === "booked" ? "Booked" : formatHour(hour)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Booking action bar */}
      <div
        data-testid="action-bar"
        className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${
          activeSelection ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="bg-white border-t border-gray-100 shadow-2xl px-4 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {activeSelection && (
              <>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {activeSelection.facilityName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedDate.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {" · "}
                    {formatRange(activeSelection.hours)}
                    {" · "}
                    {activeSelection.hours.length} hr{activeSelection.hours.length > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="text-base font-black text-gray-900">
                      ₱{totalPrice.toLocaleString()}
                    </p>
                  </div>
                  <button
                    className="px-5 py-2.5 rounded-full text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: business.accentColor }}
                    onClick={() => onBook(activeSelection, selectedDate)}
                  >
                    Book Now →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {activeSelection && <div className="h-20" />}
    </section>
  );
}
