"use client";

import { RefObject } from "react";
import { Facility } from "@/lib/types";
import { formatHour, groupByPeriod, SlotState } from "@/lib/slots";
import { SlotGridSkeleton } from "./SlotGridSkeleton";

interface SlotGridProps {
  slots: number[];
  facility: Facility;
  accentColor: string;
  loadingSlots: boolean;
  emptyMessage?: string;
  slotsRef: RefObject<HTMLDivElement | null>;
  slotState: (hour: number) => SlotState;
  onSlotClick: (hour: number) => void;
}

export default function SlotGrid({
  slots,
  facility,
  accentColor,
  loadingSlots,
  emptyMessage = "Closed on this day",
  slotsRef,
  slotState,
  onSlotClick,
}: SlotGridProps) {
  return (
    <div ref={slotsRef} className="space-y-5" data-testid={loadingSlots ? "slot-grid-loading" : "slot-grid-ready"}>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">{facility.name}</span>
          <span className="text-sm font-semibold" style={{ color: accentColor }}>
            {facility.primePricePerHour ? "from " : ""}
            ₱{facility.pricePerHour.toLocaleString()}
            <span className="font-normal text-gray-400">/hr</span>
          </span>
        </div>
        {facility.description && (
          <p className="text-xs text-gray-500 leading-relaxed">{facility.description}</p>
        )}
      </div>

      {slots.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{emptyMessage}</p>
      ) : loadingSlots ? (
        <SlotGridSkeleton />
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
                  style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
                >
                  Prime · ₱{facility.primePricePerHour.toLocaleString()}/hr
                </span>
              )}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2.5">
              {periodSlots.map((hour) => {
                const state = slotState(hour);
                const unavailable = state === "booked" || state === "pending";

                let cls =
                  "h-9 rounded-xl text-[11px] font-semibold transition-colors border-2 flex items-center justify-center w-full ";
                let style: React.CSSProperties = {};

                if (state === "active") {
                  cls += "text-white border-transparent cursor-pointer";
                  style = { backgroundColor: accentColor, borderColor: accentColor };
                } else if (state === "available") {
                  cls += "border-transparent cursor-pointer hover:brightness-95";
                  style = { backgroundColor: `${accentColor}20`, color: accentColor };
                } else if (state === "pending") {
                  cls += "border-transparent cursor-not-allowed text-amber-600";
                  style = { backgroundColor: "#fef3c7" };
                } else {
                  cls += "border-transparent cursor-not-allowed text-gray-400";
                  style = { backgroundColor: "#f3f4f6" };
                }

                return (
                  <button
                    key={hour}
                    data-slot-hour={hour}
                    disabled={unavailable}
                    onClick={() => onSlotClick(hour)}
                    className={cls}
                    style={style}
                  >
                    {state === "booked" ? "Booked" : state === "pending" ? "Pending" : formatHour(hour)}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

