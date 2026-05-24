"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Facility, OperatingHours } from "@/lib/types";
import ImageUpload from "@/components/shared/ImageUpload";
import { SectionHeader, LabeledInput } from "./SettingsShared";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Props {
  facilities: Facility[];
  businessSlug: string;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, patch: Partial<Facility>) => void;
  onUpdateHours: (facilityIdx: number, dayIdx: number, patch: Partial<OperatingHours>) => void;
  onInitHours: (facilityIdx: number) => void;
  onClearHours: (facilityIdx: number) => void;
}

export default function SettingsCourtsSection({
  facilities,
  businessSlug,
  open,
  onToggle,
  onAdd,
  onRemove,
  onUpdate,
  onUpdateHours,
  onInitHours,
  onClearHours,
}: Props) {
  const [courtOpen, setCourtOpen] = useState<Record<string, boolean>>({});
  const [courtRemoveConfirm, setCourtRemoveConfirm] = useState<string | null>(null);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
      <SectionHeader title="Courts" open={open} onToggle={onToggle} />
      {open && (
        <div className="space-y-3">
          {facilities.map((facility, idx) => {
            const isOpen = courtOpen[facility.id] ?? false;
            return (
              <div key={facility.id} data-testid={`settings-court-${facility.id}`} className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCourtOpen((o) => ({ ...o, [facility.id]: !o[facility.id] }))}
                  className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-800">{facility.name || "Unnamed Court"}</span>
                  {isOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <LabeledInput label="Name" value={facility.name} onChange={(v) => onUpdate(idx, { name: v })} />
                      <div className="sm:col-span-2">
                        <ImageUpload
                          label="Court Image"
                          value={facility.image}
                          onChange={(v) => onUpdate(idx, { image: v })}
                          path={`businesses/${businessSlug}/courts/${facility.id}`}
                          hint="Landscape, at least 400 × 260 px · JPEG, PNG or WebP · max 5 MB"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Description</label>
                        <textarea
                          value={facility.description}
                          onChange={(e) => onUpdate(idx, { description: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors resize-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-500">Price per Hour</label>
                        <input
                          type="number"
                          min={0}
                          value={facility.pricePerHour}
                          onChange={(e) => onUpdate(idx, { pricePerHour: Number(e.target.value) })}
                          className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-500">
                          Prime Price per Hour <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={facility.primePricePerHour ?? ""}
                          placeholder="—"
                          onChange={(e) => onUpdate(idx, { primePricePerHour: e.target.value === "" ? undefined : Number(e.target.value) })}
                          className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-500">
                          Prime Time Start (hour 0–23) <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={facility.primeTimeStart ?? ""}
                          placeholder="e.g. 17"
                          onChange={(e) => onUpdate(idx, { primeTimeStart: e.target.value === "" ? undefined : Number(e.target.value) })}
                          className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Operating Hours</span>
                        {facility.operatingHours && (
                          <button
                            type="button"
                            onClick={() => onClearHours(idx)}
                            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                          >
                            Use business hours
                          </button>
                        )}
                      </div>

                      {facility.operatingHours ? (
                        <div className="space-y-2">
                          {(facility.operatingHours.length === 7
                            ? facility.operatingHours
                            : DAYS.map((day) => facility.operatingHours!.find((h) => h.day === day) ?? { day, open: "6:00 AM", close: "10:00 PM", closed: false })
                          ).map((oh, dayIdx) => (
                            <div key={oh.day} data-testid={`settings-court-${facility.id}-day-${oh.day.toLowerCase()}`} className="flex items-center gap-3 text-sm">
                              <span className="w-24 text-xs font-semibold text-gray-600 shrink-0">{oh.day.slice(0, 3)}</span>
                              <input
                                type="text"
                                value={oh.open}
                                disabled={oh.closed}
                                onChange={(e) => onUpdateHours(idx, dayIdx, { open: e.target.value })}
                                className="w-24 px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-900 outline-none focus:border-gray-400 transition-colors disabled:opacity-40 disabled:bg-gray-50"
                              />
                              <span className="text-gray-400 text-xs">–</span>
                              <input
                                type="text"
                                value={oh.close}
                                disabled={oh.closed}
                                onChange={(e) => onUpdateHours(idx, dayIdx, { close: e.target.value })}
                                className="w-24 px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-900 outline-none focus:border-gray-400 transition-colors disabled:opacity-40 disabled:bg-gray-50"
                              />
                              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={oh.closed ?? false}
                                  onChange={(e) => onUpdateHours(idx, dayIdx, { closed: e.target.checked })}
                                  className="rounded"
                                />
                                Closed
                              </label>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between rounded-xl border border-dashed border-gray-200 px-4 py-3 bg-gray-50">
                          <p className="text-xs text-gray-400">Using business hours</p>
                          <button
                            type="button"
                            onClick={() => onInitHours(idx)}
                            className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                          >
                            Override for this court
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="pt-1">
                      {courtRemoveConfirm === facility.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Remove this court?</span>
                          <button
                            type="button"
                            onClick={() => { onRemove(idx); setCourtRemoveConfirm(null); }}
                            className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors"
                          >
                            Yes, remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setCourtRemoveConfirm(null)}
                            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCourtRemoveConfirm(facility.id)}
                          className="text-xs font-semibold text-red-400 hover:text-red-600 transition-colors"
                        >
                          Remove court
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-dashed border-gray-200 text-sm font-semibold text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
          >
            <Plus size={15} />
            Add court
          </button>
        </div>
      )}
    </div>
  );
}
