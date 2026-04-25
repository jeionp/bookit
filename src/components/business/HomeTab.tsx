"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Business } from "@/lib/types";
import { toDateKey, generateSlots } from "@/lib/slots";
import { getBookedHours } from "@/lib/firebase/bookings";
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
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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
        getBookedHours(business.slug, f.id, todayKey)
          .then((hours) => ({ id: f.id, count: hours.length }))
          .catch(() => ({ id: f.id, count: 0 }))
      )
    ).then((results) => {
      const map: Record<string, number> = {};
      results.forEach(({ id, count }) => { map[id] = count; });
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

  const updateScrollState = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  function scroll(dir: "left" | "right") {
    carouselRef.current?.scrollBy({ left: dir === "left" ? -220 : 220, behavior: "smooth" });
  }

  const facilityLabel =
    business.type === "court" ? "Courts" :
    business.type === "appointment" ? "Services" : "Rooms";

  function selectFacility(id: string) {
    setSelectedFacilityId(id);
    availabilityRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-8 pb-6">

      {/* Description — mobile only (desktop gets sidebar) */}
      <p className="xl:hidden text-sm text-gray-600 leading-relaxed">
        {business.description}
      </p>

      {/* Courts / facilities */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{facilityLabel}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium">
              {business.facilities.length} available
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => scroll("left")}
                disabled={!canScrollLeft}
                className="w-7 h-7 rounded-lg flex items-center justify-center border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-30 disabled:cursor-default"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => scroll("right")}
                disabled={!canScrollRight}
                className="w-7 h-7 rounded-lg flex items-center justify-center border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-30 disabled:cursor-default"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
        <div className="relative">
          <div ref={carouselRef} className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            {business.facilities.map((facility) => {
              const active = selectedFacilityId === facility.id;
              return (
                <div
                  key={facility.id}
                  onClick={() => selectFacility(facility.id)}
                  className="shrink-0 w-52 rounded-2xl overflow-hidden border-2 bg-white hover:shadow-md transition-all cursor-pointer flex flex-col"
                  style={{ borderColor: active ? business.accentColor : "#f3f4f6" }}
                >
                  <div className="relative h-32 bg-gray-100">
                    <Image
                      src={facility.image}
                      alt={facility.name}
                      fill
                      className="object-cover"
                      sizes="208px"
                    />
                    {(() => {
                      const badge = occupancyBadge(facility.id);
                      return badge ? (
                        <span
                          className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ backgroundColor: badge.bg, color: badge.text }}
                        >
                          {badge.label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="text-sm font-bold text-gray-900 leading-tight">{facility.name}</h3>
                    <span className="text-xs font-semibold mt-0.5" style={{ color: business.accentColor }}>
                      {facility.primePricePerHour ? "from " : ""}
                      ₱{facility.pricePerHour.toLocaleString()}
                      <span className="font-normal text-gray-400">/hr</span>
                    </span>
                    <div className="mt-auto min-h-3" />
                    <button
                      onClick={(e) => { e.stopPropagation(); selectFacility(facility.id); }}
                      className="w-full py-2 rounded-xl text-xs font-bold transition-colors"
                      style={
                        active
                          ? { backgroundColor: business.accentColor, color: "white" }
                          : { backgroundColor: `${business.accentColor}15`, color: business.accentColor }
                      }
                    >
                      {active ? "Selected ✓" : "Check availability →"}
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="shrink-0 w-2" />
          </div>
          {canScrollLeft && (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white to-transparent" />
          )}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
        </div>
      </section>

      <div className="border-t border-gray-100" />

      {/* Availability */}
      <div ref={availabilityRef} className="scroll-mt-20">
        <AvailabilitySection
          business={business}
          onBook={onBook}
          selectedFacilityId={selectedFacilityId}
          onFacilityChange={setSelectedFacilityId}
        />
      </div>

    </div>
  );
}
