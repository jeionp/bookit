"use client";

import { useState, useRef, useEffect, useMemo, Fragment } from "react";
import { Business } from "@/lib/types";
import { toDateKey, generateSlots } from "@/lib/slots";
import AvailabilitySection, { Selection } from "@/app/[businessSlug]/_components/AvailabilitySection";

interface HomeTabProps {
  business: Business;
  onBook: (selection: Selection, date: Date) => void;
}

export default function HomeTab({ business, onBook }: HomeTabProps) {
  const [selectedFacilityId, setSelectedFacilityId] = useState(
    business.facilities[0]?.id ?? ""
  );
  const availabilityRef = useRef<HTMLDivElement>(null);

  const [todayBookedCounts, setTodayBookedCounts] = useState<Record<string, number>>({});

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const todayDayName = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long" }),
    []
  );
  const totalSlotsToday = useMemo(() => {
    const hours = business.operatingHours.find((h) => h.day === todayDayName);
    if (!hours || hours.closed) return 0;
    return generateSlots(hours.open, hours.close).length;
  }, [business.operatingHours, todayDayName]);

  useEffect(() => {
    if (totalSlotsToday === 0) return;
    Promise.all(
      business.facilities.map((f) =>
        fetch(`/api/availability?businessSlug=${encodeURIComponent(business.slug)}&facilityId=${encodeURIComponent(f.id)}&date=${encodeURIComponent(todayKey)}`)
          .then((r) => r.json())
          .then((data: { bookedHours: number[] }) => ({ id: f.id, count: (data.bookedHours ?? []).length }))
          .catch(() => ({ id: f.id, count: 0 }))
      )
    ).then((results) => {
      const map: Record<string, number> = {};
      results.forEach(({ id, count }: { id: string; count: number }) => { map[id] = count; });
      setTodayBookedCounts(map);
    });
  }, [business.facilities, business.slug, todayKey, totalSlotsToday]);

  function occupancyBadge(facilityId: string): { label: string; bg: string; text: string } | null {
    if (totalSlotsToday === 0 || !(facilityId in todayBookedCounts)) return null;
    const ratio = todayBookedCounts[facilityId] / totalSlotsToday;
    if (ratio >= 0.8) return { label: "Almost full", bg: "#fee2e2", text: "#991b1b" };
    if (ratio >= 0.6) return { label: "Busy", bg: "#fef3c7", text: "#92400e" };
    return null;
  }

  const facilityLabel =
    business.type === "court" ? "Courts" :
    business.type === "appointment" ? "Services" : "Rooms";

  function selectFacility(id: string) {
    setSelectedFacilityId(id);
    // Only scroll on mobile — desktop shows courts and availability side-by-side.
    // Use matchMedia so the check matches Tailwind's xl: breakpoint exactly,
    // avoiding the off-by-scrollbar-width issue with window.innerWidth.
    if (!window.matchMedia('(min-width: 1280px)').matches) {
      availabilityRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="pb-6">

      {/* Desktop: 2-col split [Courts 280px | Availability 1fr]. Mobile: stacked. */}
      <div className="space-y-8 xl:space-y-0 xl:grid xl:grid-cols-[280px_1fr] xl:gap-8 xl:items-start">

        {/* Courts — sticky on desktop */}
        <div className="xl:sticky xl:top-[72px] xl:self-start">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">{facilityLabel}</h2>
              <span className="text-xs text-gray-400 font-medium">
                {business.facilities.length} available
              </span>
            </div>

            {/*
              Mobile: horizontal scrollable chip row (like the date strip).
              Desktop: vertical text list with radio indicator.
              Two separate elements per facility so each breakpoint gets
              its own layout and colour treatment without inline-style hacks.
            */}
            <div
              data-testid="courts-list"
              className="flex gap-2 overflow-x-auto scrollbar-hide pb-1
                         xl:flex-col xl:overflow-visible xl:pb-0"
            >
              {business.facilities.map((facility) => {
                const active = selectedFacilityId === facility.id;
                const badge = occupancyBadge(facility.id);
                return (
                  <Fragment key={facility.id}>

                    {/* ── Mobile chip (hidden at xl) ── */}
                    <button
                      onClick={() => selectFacility(facility.id)}
                      data-testid="court-chip"
                      className="xl:hidden shrink-0 flex flex-col items-center justify-center
                                 px-3 py-2 rounded-xl border-2 min-w-[72px] transition-all cursor-pointer"
                      style={{
                        borderColor: active ? business.accentColor : "transparent",
                        backgroundColor: active ? business.accentColor : "#f9fafb",
                      }}
                    >
                      <span
                        className="text-xs font-bold leading-tight text-center truncate max-w-[80px]"
                        style={{ color: active ? "white" : "#111827" }}
                      >
                        {facility.name}
                      </span>
                      <span
                        className="text-[10px] font-semibold mt-0.5"
                        style={{ color: active ? "rgba(255,255,255,0.8)" : business.accentColor }}
                      >
                        {facility.primePricePerHour ? "from " : ""}₱{facility.pricePerHour.toLocaleString()}
                      </span>
                    </button>

                    {/* ── Desktop list row (hidden below xl) ── */}
                    <button
                      onClick={() => selectFacility(facility.id)}
                      data-testid="court-list-item"
                      className="hidden xl:flex w-full items-center gap-3 px-3 py-2.5
                                 rounded-xl border-2 transition-all cursor-pointer text-left hover:shadow-sm"
                      style={{
                        borderColor: active ? business.accentColor : "transparent",
                        backgroundColor: active ? `${business.accentColor}0d` : "#f9fafb",
                      }}
                    >
                      <span
                        className="shrink-0 w-3.5 h-3.5 rounded-full border-2 transition-colors"
                        style={active
                          ? { backgroundColor: business.accentColor, borderColor: business.accentColor }
                          : { borderColor: "#d1d5db" }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-gray-900 block truncate">{facility.name}</span>
                        <span className="text-xs font-semibold" style={{ color: business.accentColor }}>
                          {facility.primePricePerHour ? "from " : ""}
                          ₱{facility.pricePerHour.toLocaleString()}
                          <span className="font-normal text-gray-400">/hr</span>
                        </span>
                      </span>
                      {badge && (
                        <span
                          className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ backgroundColor: badge.bg, color: badge.text }}
                        >
                          {badge.label}
                        </span>
                      )}
                    </button>

                  </Fragment>
                );
              })}
            </div>
          </section>
        </div>

        {/* Availability — sticky on desktop, scrolls into view on mobile */}
        <div ref={availabilityRef} className="scroll-mt-20 xl:sticky xl:top-[72px] xl:self-start min-w-0">
          <AvailabilitySection
            business={business}
            onBook={onBook}
            selectedFacilityId={selectedFacilityId}
          />
        </div>

      </div>
    </div>
  );
}
