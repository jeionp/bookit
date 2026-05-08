"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { v4 as uuid } from "uuid";
import ImageUpload from "@/components/shared/ImageUpload";
import { Facility, OperatingHours } from "@/lib/types";
import { WizardDraft } from "../OnboardingWizard";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const COMMON_AMENITIES = [
  "Parking", "Restrooms", "Showers", "Locker rooms",
  "Equipment rental", "Café / Snack bar", "WiFi", "Air conditioning",
  "Wheelchair accessible", "Security cameras",
];

function defaultHours(): OperatingHours[] {
  return DAYS.map((day) => ({ day, open: "06:00 AM", close: "10:00 PM", closed: false }));
}

function defaultFacility(): Facility {
  return {
    id: uuid(),
    name: "",
    description: "",
    image: "",
    pricePerHour: 0,
    currency: "PHP",
  };
}

interface FacilityCardProps {
  facility: Facility;
  index: number;
  slug: string;
  onChange: (f: Facility) => void;
  onRemove: () => void;
}

function FacilityCard({ facility, index, slug, onChange, onRemove }: FacilityCardProps) {
  const [open, setOpen] = useState(index === 0);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">
          {facility.name || `Facility ${index + 1}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} />
          </button>
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="p-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Name<span className="text-red-400 ml-0.5">*</span></label>
              <input
                type="text"
                value={facility.name}
                onChange={(e) => onChange({ ...facility, name: e.target.value })}
                placeholder="e.g. Court A"
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Price per hour (PHP)<span className="text-red-400 ml-0.5">*</span></label>
              <input
                type="number"
                min={0}
                value={facility.pricePerHour || ""}
                onChange={(e) => onChange({ ...facility, pricePerHour: Number(e.target.value) })}
                placeholder="e.g. 500"
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Prime-time price (optional)</label>
              <input
                type="number"
                min={0}
                value={facility.primePricePerHour ?? ""}
                onChange={(e) => onChange({ ...facility, primePricePerHour: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="e.g. 700"
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Prime-time starts at (hour)</label>
              <input
                type="number"
                min={0}
                max={23}
                value={facility.primeTimeStart ?? ""}
                onChange={(e) => onChange({ ...facility, primeTimeStart: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="e.g. 17 (5 PM)"
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Description</label>
            <input
              type="text"
              value={facility.description}
              onChange={(e) => onChange({ ...facility, description: e.target.value })}
              placeholder="e.g. Full-size badminton court with AC"
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
            />
          </div>

          <ImageUpload
            label="Court / facility image"
            value={facility.image}
            onChange={(url) => onChange({ ...facility, image: url })}
            path={`facilities/${slug}/${facility.id}`}
          />
        </div>
      )}
    </div>
  );
}

interface Props {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function Step3Facilities({ draft, patch, onBack, onNext }: Props) {
  const hours = draft.operatingHours.length > 0 ? draft.operatingHours : defaultHours();

  function setFacility(i: number, f: Facility) {
    const updated = [...draft.facilities];
    updated[i] = f;
    patch({ facilities: updated });
  }

  function removeFacility(i: number) {
    patch({ facilities: draft.facilities.filter((_, idx) => idx !== i) });
  }

  function addFacility() {
    patch({ facilities: [...draft.facilities, defaultFacility()] });
  }

  function setHour(i: number, field: keyof OperatingHours, value: string | boolean) {
    const updated = [...hours];
    updated[i] = { ...updated[i], [field]: value };
    patch({ operatingHours: updated });
  }

  function toggleAmenity(a: string) {
    const current = draft.amenities;
    patch({
      amenities: current.includes(a) ? current.filter((x) => x !== a) : [...current, a],
    });
  }

  const canProceed = draft.facilities.length > 0 &&
    draft.facilities.every((f) => f.name.trim() && f.pricePerHour > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Facilities & Hours</h2>
        <p className="text-sm text-gray-500 mt-1">Add the courts or spaces customers can book.</p>
      </div>

      {/* Facilities */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Facilities</h3>
          <button
            type="button"
            onClick={addFacility}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Plus size={12} /> Add facility
          </button>
        </div>

        {draft.facilities.length === 0 ? (
          <button
            type="button"
            onClick={addFacility}
            className="flex flex-col items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
          >
            <Plus size={20} />
            <span className="text-sm font-medium">Add your first facility</span>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {draft.facilities.map((f, i) => (
              <FacilityCard
                key={f.id}
                facility={f}
                index={i}
                slug={draft.slug}
                onChange={(updated) => setFacility(i, updated)}
                onRemove={() => removeFacility(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Operating hours */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Operating Hours</h3>
        <div className="flex flex-col gap-1">
          {hours.map((h, i) => (
            <div key={h.day} className="flex items-center gap-3 py-1.5">
              <span className="text-sm text-gray-600 w-24 shrink-0">{h.day}</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!h.closed}
                  onChange={(e) => setHour(i, "closed", !e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs text-gray-500">Open</span>
              </label>
              {!h.closed && (
                <>
                  <input
                    type="time"
                    value={h.open}
                    onChange={(e) => setHour(i, "open", e.target.value)}
                    className="px-2 py-1 rounded-lg border border-gray-200 text-sm text-gray-700 outline-none focus:border-gray-400"
                  />
                  <span className="text-gray-400 text-sm">–</span>
                  <input
                    type="time"
                    value={h.close}
                    onChange={(e) => setHour(i, "close", e.target.value)}
                    className="px-2 py-1 rounded-lg border border-gray-200 text-sm text-gray-700 outline-none focus:border-gray-400"
                  />
                </>
              )}
              {h.closed && <span className="text-xs text-gray-400 italic">Closed</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Amenities */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Amenities</h3>
        <div className="flex flex-wrap gap-2">
          {COMMON_AMENITIES.map((a) => {
            const selected = draft.amenities.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleAmenity(a)}
                className={[
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  selected
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-200 text-gray-600 hover:border-gray-300",
                ].join(" ")}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-blue-700 transition-colors"
        >
          Next: Review →
        </button>
      </div>
    </div>
  );
}
