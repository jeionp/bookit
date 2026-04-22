"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Sunrise, Sun, Moon } from "lucide-react";
import { DayPicker, useDayPicker } from "react-day-picker";
import type { MonthCaptionProps } from "react-day-picker";
import "react-day-picker/src/style.css";
import { Business, Facility } from "@/lib/types";

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

type SlotStatus = "available" | "booked" | "private";

function getSlotStatus(courtId: string, dateKey: string, hour: number): SlotStatus {
  let hash = 0;
  const key = `${courtId}${dateKey}${hour}`;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(31, hash) + key.charCodeAt(i);
  }
  const n = Math.abs(hash) % 20;
  if (n < 4) return "private";
  if (n < 10) return "booked";
  return "available";
}

// Walk from startHour toward endHour, stopping before the first unavailable slot.
function getValidRange(
  facilityId: string,
  dateKey: string,
  startHour: number,
  endHour: number
): number[] {
  const step = startHour <= endHour ? 1 : -1;
  const hours: number[] = [];
  for (let h = startHour; step > 0 ? h <= endHour : h >= endHour; h += step) {
    if (getSlotStatus(facilityId, dateKey, h) !== "available") break;
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
}

interface DragState {
  facilityId: string;
  facilityName: string;
  startHour: number;
  currentHour: number;
  pricePerHour: number;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function AvailabilitySection({ business }: { business: Business }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

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

  // Preview hours while dragging
  const previewHours = drag
    ? getValidRange(drag.facilityId, dateKey, drag.startHour, drag.currentHour)
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

  // Finalize drag selection on mouseup anywhere in the document
  useEffect(() => {
    function handleMouseUp() {
      if (!drag) return;
      const hours = getValidRange(
        drag.facilityId,
        dateKey,
        drag.startHour,
        drag.currentHour
      );
      setDrag(null);

      if (hours.length === 0) return;

      // Single click on already-selected slot → deselect
      if (
        hours.length === 1 &&
        selection?.facilityId === drag.facilityId &&
        selection.hours.length === 1 &&
        selection.hours[0] === hours[0]
      ) {
        setSelection(null);
        return;
      }

      setSelection({
        facilityId: drag.facilityId,
        facilityName: drag.facilityName,
        hours,
        pricePerHour: drag.pricePerHour,
      });
    }

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [drag, dateKey, selection]);

  function handleSlotMouseDown(facility: Facility, hour: number) {
    if (getSlotStatus(facility.id, dateKey, hour) !== "available") return;
    // Clear existing selection when starting a new drag on any court
    setSelection(null);
    setDrag({
      facilityId: facility.id,
      facilityName: facility.name,
      startHour: hour,
      currentHour: hour,
      pricePerHour: facility.pricePerHour,
    });
  }

  function handleSlotMouseEnter(facility: Facility, hour: number) {
    if (!drag || drag.facilityId !== facility.id) return;
    setDrag((d) => (d ? { ...d, currentHour: hour } : null));
  }

  function selectDate(date: Date | undefined) {
    if (!date) return;
    setSelectedDate(date);
    setSelection(null);
    setCalendarOpen(false);
  }

  // Determine visual state of a slot for styling
  function slotState(
    facilityId: string,
    hour: number
  ): "active" | "preview" | "available" | "booked" | "private" {
    const status = getSlotStatus(facilityId, dateKey, hour);
    if (status !== "available") return status;
    if (drag?.facilityId === facilityId && previewHours.includes(hour)) return "preview";
    if (!drag && selection?.facilityId === facilityId && selection.hours.includes(hour))
      return "active";
    return "available";
  }

  const totalPrice = selection
    ? selection.hours.length * selection.pricePerHour
    : 0;

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

      {/* Slot grid */}
      {slots.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Closed on this day</p>
      ) : (
        // select-none prevents text highlight during drag
        <div className="space-y-6 select-none">
          {business.facilities.map((facility) => (
            <div key={facility.id}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-800">
                  {facility.name}
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: business.accentColor }}
                >
                  ₱{facility.pricePerHour.toLocaleString()}
                  <span className="font-normal text-gray-400">/hr</span>
                </span>
              </div>

              <div className="space-y-3">
                {groupByPeriod(slots).map(({ key, label, icon: Icon, slots: periodSlots }) => (
                  <div key={key}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon size={12} className="text-gray-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {periodSlots.map((hour) => {
                        const state = slotState(facility.id, hour);
                        const unavailable = state === "booked" || state === "private";

                        let cls =
                          "w-16 h-9 rounded-xl text-[11px] font-semibold transition-colors border-2 flex items-center justify-center shrink-0 ";
                        let style: React.CSSProperties = {};

                        if (state === "active") {
                          cls += "text-white border-transparent cursor-pointer";
                          style = {
                            backgroundColor: business.accentColor,
                            borderColor: business.accentColor,
                          };
                        } else if (state === "preview") {
                          cls += "text-white border-transparent cursor-pointer";
                          style = {
                            backgroundColor: business.accentColor,
                            opacity: 0.6,
                          };
                        } else if (state === "available") {
                          cls += "border-transparent cursor-pointer hover:brightness-95";
                          style = {
                            backgroundColor: `${business.accentColor}20`,
                            color: business.accentColor,
                          };
                        } else if (state === "booked") {
                          cls += "border-transparent cursor-not-allowed text-gray-400";
                          style = { backgroundColor: "#f3f4f6" };
                        } else {
                          cls += "border-transparent cursor-not-allowed text-red-400";
                          style = { backgroundColor: "#fee2e2" };
                        }

                        return (
                          <button
                            key={hour}
                            disabled={unavailable}
                            onMouseDown={() => handleSlotMouseDown(facility, hour)}
                            onMouseEnter={() => handleSlotMouseEnter(facility, hour)}
                            className={cls}
                            style={style}
                            // Prevent drag from triggering browser's default image/text drag
                            draggable={false}
                          >
                            {state === "booked"
                              ? "Booked"
                              : state === "private"
                              ? "Reserved"
                              : formatHour(hour)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Booking action bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${
          selection ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="bg-white border-t border-gray-100 shadow-2xl px-4 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {selection && (
              <>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {selection.facilityName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedDate.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {" · "}
                    {formatRange(selection.hours)}
                    {" · "}
                    {selection.hours.length} hr{selection.hours.length > 1 ? "s" : ""}
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
                    onClick={() => alert("Booking flow coming soon!")}
                  >
                    Book Now →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {selection && <div className="h-20" />}
    </section>
  );
}
