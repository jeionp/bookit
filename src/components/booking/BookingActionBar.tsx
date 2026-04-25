"use client";

import { Selection, formatRange } from "@/lib/slots";

interface BookingActionBarProps {
  activeSelection: Selection | null;
  selectedDate: Date;
  accentColor: string;
  onBook: (selection: Selection, date: Date) => void;
}

export default function BookingActionBar({
  activeSelection,
  selectedDate,
  accentColor,
  onBook,
}: BookingActionBarProps) {
  return (
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
                    ₱{activeSelection.totalPrice.toLocaleString()}
                  </p>
                </div>
                <button
                  className="px-5 py-2.5 rounded-full text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: accentColor }}
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
  );
}
