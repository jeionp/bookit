"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, useDayPicker } from "react-day-picker";
import type { MonthCaptionProps } from "react-day-picker";
import "react-day-picker/src/style.css";
import { Business, Facility } from "@/lib/types";
import { Selection, toDateKey, generateSlots } from "@/lib/slots";
import { useSlotSelection } from "@/hooks/useSlotSelection";
import SlotGrid from "@/components/booking/SlotGrid";
import BookingActionBar from "@/components/booking/BookingActionBar";

export type { Selection };

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
        {calendarMonth.date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
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

export default function AvailabilitySection({
  business,
  onBook,
  selectedFacilityId,
}: {
  business: Business;
  onBook: (selection: Selection, date: Date) => void;
  selectedFacilityId: string;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [bookedHours, setBookedHours] = useState<number[]>([]);
  const [pendingHours, setPendingHours] = useState<number[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const facility: Facility =
    business.facilities.find((f) => f.id === selectedFacilityId) ??
    business.facilities[0];

  const accentColor = business.accentColor;
  const dateKey = toDateKey(selectedDate);
  const isToday = dateKey === toDateKey(today);
  const dayName = selectedDate.toLocaleDateString("en-US", { weekday: "long" });
  const todayHours = (facility.operatingHours ?? business.operatingHours).find((h) => h.day === dayName);
  const currentHour = new Date().getHours();
  const slots =
    todayHours && !todayHours.closed
      ? generateSlots(todayHours.open, todayHours.close).filter(
          (h) => !isToday || h > currentHour
        )
      : [];

  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 30);
    return d;
  }, [today]);

  // 14-day strip
  const stripDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d);
    }
    return days;
  }, [today]);

  const selectedBeyondStrip = selectedDate > stripDays[stripDays.length - 1];

  const fetchKey = `${facility.id}:${dateKey}`;
  const loadingSlots = loadedKey !== fetchKey;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/availability?businessSlug=${encodeURIComponent(business.slug)}&facilityId=${encodeURIComponent(facility.id)}&date=${encodeURIComponent(dateKey)}`)
      .then((r) => r.json())
      .then((data: { bookedHours: number[]; pendingHours: number[] }) => {
        if (!cancelled) {
          setBookedHours(data.bookedHours ?? []);
          setPendingHours(data.pendingHours ?? []);
          setLoadedKey(`${facility.id}:${dateKey}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBookedHours([]);
          setPendingHours([]);
          setLoadedKey(`${facility.id}:${dateKey}`);
        }
      });
    return () => { cancelled = true; };
  }, [facility.id, dateKey, business.slug]);

  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    }
    if (calendarOpen) {
      document.addEventListener("mousedown", handleOutside);
      document.addEventListener("touchstart", handleOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [calendarOpen]);

  const { activeSelection, slotsRef, handleSlotClick, slotState } =
    useSlotSelection(facility, bookedHours, pendingHours);

  function selectDate(date: Date | undefined) {
    if (!date) return;
    setSelectedDate(date);
    setCalendarOpen(false);
  }

  return (
    <section data-testid="availability-section" className="space-y-5">

      {/* Selected court hero */}
      <div data-testid="court-hero" className="relative h-40 rounded-2xl overflow-hidden bg-gray-100">
        <Image
          src={facility.image || "/placeholder-court.svg"}
          alt={facility.name}
          fill
          className="object-cover"
          sizes="(min-width: 1280px) calc(100vw - 340px), 100vw"
          priority
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3">
          <p className="text-white text-sm font-bold leading-tight">{facility.name}</p>
          <p className="text-white/80 text-xs">
            {facility.primePricePerHour ? "from " : ""}₱{facility.pricePerHour.toLocaleString()}/hr
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900">Check Availability</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Tap a slot to select it. Tap another to extend your booking.
        </p>
      </div>

      {/* Date strip + calendar overflow */}
      <div className="relative" ref={calendarRef}>
        <div
          data-testid="date-strip"
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
        >
          {stripDays.map((date) => {
            const key = toDateKey(date);
            const dn = date.toLocaleDateString("en-US", { weekday: "long" });
            const abbr = date.toLocaleDateString("en-US", { weekday: "short" });
            const ops = (facility.operatingHours ?? business.operatingHours).find((h) => h.day === dn);
            const isClosed = !ops || ops.closed;
            const isSelected = key === dateKey;
            const isTodayChip = key === toDateKey(today);

            return (
              <button
                key={key}
                name={key}
                onClick={() => selectDate(date)}
                className={`shrink-0 flex flex-col items-center justify-center w-11 h-14 rounded-2xl
                  transition-all border-2 cursor-pointer
                  ${isSelected ? "text-white" : "text-gray-700"}
                  ${isClosed && !isSelected ? "opacity-30" : "hover:brightness-95"}
                `}
                style={
                  isSelected
                    ? { backgroundColor: accentColor, borderColor: accentColor }
                    : isTodayChip
                    ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                    : { borderColor: "transparent", backgroundColor: "#f9fafb" }
                }
              >
                <span className="text-[9px] font-bold uppercase tracking-wide leading-none">
                  {isTodayChip ? "Today" : abbr}
                </span>
                <span className="text-base font-bold leading-none mt-0.5">
                  {date.getDate()}
                </span>
              </button>
            );
          })}

          {/* Calendar overflow — for dates beyond 14 days */}
          <button
            data-testid="calendar-btn"
            onClick={() => setCalendarOpen((o) => !o)}
            className={`shrink-0 flex flex-col items-center justify-center w-11 h-14 rounded-2xl
              border-2 transition-all cursor-pointer
              ${calendarOpen ? "text-white" : "text-gray-400 hover:bg-gray-50"}
            `}
            style={
              calendarOpen
                ? { backgroundColor: accentColor, borderColor: accentColor }
                : { borderColor: "#e5e7eb" }
            }
          >
            <CalendarDays size={15} />
            <span className="text-[9px] font-bold uppercase tracking-wide mt-1 leading-none">
              More
            </span>
          </button>
        </div>

        {/* Indicator when selected date is beyond the 14-day strip */}
        {selectedBeyondStrip && (
          <p className="text-xs text-gray-500 mt-1.5">
            Selected:{" "}
            <span className="font-semibold" style={{ color: accentColor }}>
              {selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
          </p>
        )}

        {/* Full calendar dropdown for dates beyond the strip */}
        {calendarOpen && (
          <div
            data-testid="calendar-dropdown"
            className="absolute top-full left-0 mt-2 z-40 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden w-fit"
            style={{ "--rdp-accent-color": accentColor } as React.CSSProperties}
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
                weekday: "flex-1 text-center text-[11px] font-semibold text-gray-400 uppercase py-1",
                week: "flex",
                day: "flex-1 aspect-square flex items-center justify-center",
                day_button:
                  "w-9 h-9 rounded-xl text-sm font-medium text-gray-900 transition-all hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed",
                selected: "!bg-[var(--rdp-accent-color)] !text-white rounded-xl font-bold hover:opacity-90",
                today: "font-bold text-[var(--rdp-accent-color)]",
                outside: "opacity-0 pointer-events-none",
                disabled: "opacity-25 cursor-not-allowed",
              }}
            />
          </div>
        )}
      </div>

      <SlotGrid
        slots={slots}
        facility={facility}
        accentColor={accentColor}
        loadingSlots={loadingSlots}
        emptyMessage={
          todayHours?.closed
            ? "Closed on this day"
            : isToday
            ? "No more slots available today"
            : "Closed on this day"
        }
        slotsRef={slotsRef}
        slotState={slotState}
        onSlotClick={handleSlotClick}
      />

      <BookingActionBar
        activeSelection={activeSelection}
        selectedDate={selectedDate}
        accentColor={accentColor}
        onBook={onBook}
      />

      <div className="h-20" />
    </section>
  );
}
