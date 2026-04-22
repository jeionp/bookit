"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Business } from "@/lib/types";
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
      <p className="lg:hidden text-sm text-gray-600 leading-relaxed">
        {business.description}
      </p>

      {/* Courts / facilities */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{facilityLabel}</h2>
          <span className="text-xs text-gray-400 font-medium">
            {business.facilities.length} available
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {business.facilities.map((facility) => {
            const active = selectedFacilityId === facility.id;
            return (
              <div
                key={facility.id}
                onClick={() => selectFacility(facility.id)}
                className="rounded-2xl overflow-hidden border-2 bg-white hover:shadow-md transition-all cursor-pointer"
                style={{ borderColor: active ? business.accentColor : "#f3f4f6" }}
              >
                <div className="relative h-36 bg-gray-100">
                  <Image
                    src={facility.image}
                    alt={facility.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 50vw"
                  />
                </div>
                <div className="p-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900">{facility.name}</h3>
                    <span className="text-sm font-bold" style={{ color: business.accentColor }}>
                      {facility.primePricePerHour ? "from " : ""}
                      ₱{facility.pricePerHour.toLocaleString()}
                      <span className="text-xs font-normal text-gray-400">/hr</span>
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {facility.description}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); selectFacility(facility.id); }}
                    className="mt-3 w-full py-2 rounded-xl text-xs font-bold transition-colors"
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
