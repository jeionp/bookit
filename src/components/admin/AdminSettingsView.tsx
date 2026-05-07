"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, X, Plus, Upload, Image as ImageIcon } from "lucide-react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { Business, Facility, OperatingHours } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function defaultOperatingHours(): OperatingHours[] {
  return DAYS.map((day) => ({ day, open: "6:00 AM", close: "10:00 PM", closed: false }));
}

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between w-full text-left"
    >
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">{title}</h3>
      {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
    </button>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <input
        data-testid={testId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
      />
    </div>
  );
}

function ImageUpload({
  label,
  value,
  onChange,
  path,
  hint,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  path: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputId = `img-${path.replace(/\//g, "-")}`;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be under 5 MB.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      onChange(url);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <div className="flex items-start gap-3">
        {/* Always show preview area — placeholder when no image is set */}
        {value ? (
          <img
            src={value}
            alt=""
            className="w-16 h-16 object-cover rounded-xl border border-gray-200 shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
            <ImageIcon size={20} className="text-gray-300" />
          </div>
        )}
        <div className="flex-1 flex flex-col gap-1.5">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            className="hidden"
          />
          <label
            htmlFor={inputId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors w-fit"
          >
            {uploading ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin inline-block" />
                Uploading…
              </>
            ) : (
              <>
                <Upload size={12} />
                {value ? "Replace image" : "Upload image"}
              </>
            )}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => { setUploadError(null); onChange(e.target.value); }}
            placeholder="Or paste a URL…"
            disabled={uploading}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors disabled:opacity-50"
          />
          {hint && <p className="text-xs text-gray-400">{hint}</p>}
        </div>
      </div>
      {uploadError && <p className="text-xs text-red-500 mt-0.5">{uploadError}</p>}
    </div>
  );
}

export default function AdminSettingsView({ business }: { business: Business }) {
  const { user } = useAuth();

  // Editable state — deep clone so we never mutate props
  const [draft, setDraft] = useState<Business>(() => JSON.parse(JSON.stringify(business)));

  const [sectionOpen, setSectionOpen] = useState({
    info: true,
    courts: true,
    amenities: true,
  });

  const [courtOpen, setCourtOpen] = useState<Record<string, boolean>>({});
  const [courtRemoveConfirm, setCourtRemoveConfirm] = useState<string | null>(null);

  const [amenityInput, setAmenityInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);

  function toggleSection(key: keyof typeof sectionOpen) {
    setSectionOpen((s) => ({ ...s, [key]: !s[key] }));
  }

  // ── Business info helpers ────────────────────────────────────────────────

  function setField<K extends keyof Business>(key: K, value: Business[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // ── Facility helpers ─────────────────────────────────────────────────────

  function updateFacility(idx: number, patch: Partial<Facility>) {
    setDraft((d) => {
      const facilities = [...d.facilities];
      facilities[idx] = { ...facilities[idx], ...patch };
      return { ...d, facilities };
    });
  }

  function removeFacility(idx: number) {
    setDraft((d) => ({
      ...d,
      facilities: d.facilities.filter((_, i) => i !== idx),
    }));
    setCourtRemoveConfirm(null);
  }

  function addFacility() {
    const newId = `court-${Date.now()}`;
    const blank: Facility = {
      id: newId,
      name: "New Court",
      description: "",
      image: "",
      pricePerHour: 0,
      currency: draft.facilities[0]?.currency ?? "PHP",
    };
    setDraft((d) => ({ ...d, facilities: [...d.facilities, blank] }));
    setCourtOpen((o) => ({ ...o, [newId]: true }));
  }

  function updateFacilityHours(
    facilityIdx: number,
    dayIdx: number,
    patch: Partial<OperatingHours>
  ) {
    setDraft((d) => {
      const facilities = [...d.facilities];
      const facility = { ...facilities[facilityIdx] };
      const hours = [...(facility.operatingHours ?? [])];
      hours[dayIdx] = { ...hours[dayIdx], ...patch };
      facility.operatingHours = hours;
      facilities[facilityIdx] = facility;
      return { ...d, facilities };
    });
  }

  function initFacilityHours(facilityIdx: number) {
    const base = draft.operatingHours.length > 0
      ? JSON.parse(JSON.stringify(draft.operatingHours)) as OperatingHours[]
      : defaultOperatingHours();
    // Ensure all 7 days are present
    const filled = DAYS.map((day) => base.find((h) => h.day === day) ?? { day, open: "6:00 AM", close: "10:00 PM", closed: false });
    updateFacility(facilityIdx, { operatingHours: filled });
  }

  function clearFacilityHours(facilityIdx: number) {
    updateFacility(facilityIdx, { operatingHours: undefined });
  }

  // ── Amenity helpers ──────────────────────────────────────────────────────

  function removeAmenity(idx: number) {
    setDraft((d) => ({
      ...d,
      amenities: d.amenities.filter((_, i) => i !== idx),
    }));
  }

  function addAmenity() {
    const trimmed = amenityInput.trim();
    if (!trimmed || draft.amenities.includes(trimmed)) return;
    setDraft((d) => ({ ...d, amenities: [...d.amenities, trimmed] }));
    setAmenityInput("");
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/businesses/${draft.slug}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(draft),
      });
      setSaveResult(res.ok ? "success" : "error");
    } catch {
      setSaveResult("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 pb-24">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* ── Section A: Business Info ──────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
          <SectionHeader title="Business Info" open={sectionOpen.info} onToggle={() => toggleSection("info")} />
          {sectionOpen.info && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LabeledInput label="Name" value={draft.name} onChange={(v) => setField("name", v)} testId="settings-name-input" />
              <LabeledInput label="Tagline" value={draft.tagline} onChange={(v) => setField("tagline", v)} />
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-gray-500 block mb-1">Description</label>
                <textarea
                  value={draft.description}
                  onChange={(e) => setField("description", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors resize-none"
                />
              </div>
              <LabeledInput label="Location" value={draft.location} onChange={(v) => setField("location", v)} />
              <LabeledInput label="Address" value={draft.address} onChange={(v) => setField("address", v)} />
              <LabeledInput label="Phone" value={draft.phone} onChange={(v) => setField("phone", v)} />
              <LabeledInput label="Email" value={draft.email} onChange={(v) => setField("email", v)} />
              <div className="sm:col-span-2">
                <ImageUpload
                  label="Cover Image"
                  value={draft.coverImage}
                  onChange={(v) => setField("coverImage", v)}
                  path={`businesses/${draft.slug}/cover`}
                  hint="Landscape, at least 1200 × 400 px · JPEG, PNG or WebP · max 5 MB"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Accent Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={draft.accentColor}
                    onChange={(e) => setField("accentColor", e.target.value)}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
                  />
                  <span className="text-sm font-mono text-gray-600">{draft.accentColor}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Section B: Courts ────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
          <SectionHeader title="Courts" open={sectionOpen.courts} onToggle={() => toggleSection("courts")} />
          {sectionOpen.courts && (
            <div className="space-y-3">
              {draft.facilities.map((facility, idx) => {
                const isOpen = courtOpen[facility.id] ?? false;
                return (
                  <div key={facility.id} data-testid={`settings-court-${facility.id}`} className="border border-gray-100 rounded-xl overflow-hidden">
                    {/* Court card header */}
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
                          <LabeledInput label="Name" value={facility.name} onChange={(v) => updateFacility(idx, { name: v })} />
                          <div className="sm:col-span-2">
                            <ImageUpload
                              label="Court Image"
                              value={facility.image}
                              onChange={(v) => updateFacility(idx, { image: v })}
                              path={`businesses/${draft.slug}/courts/${facility.id}`}
                              hint="Landscape, at least 400 × 260 px · JPEG, PNG or WebP · max 5 MB"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs font-semibold text-gray-500 block mb-1">Description</label>
                            <textarea
                              value={facility.description}
                              onChange={(e) => updateFacility(idx, { description: e.target.value })}
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
                              onChange={(e) => updateFacility(idx, { pricePerHour: Number(e.target.value) })}
                              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-gray-500">Prime Price per Hour <span className="font-normal text-gray-400">(optional)</span></label>
                            <input
                              type="number"
                              min={0}
                              value={facility.primePricePerHour ?? ""}
                              placeholder="—"
                              onChange={(e) => updateFacility(idx, { primePricePerHour: e.target.value === "" ? undefined : Number(e.target.value) })}
                              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-gray-500">Prime Time Start (hour 0–23) <span className="font-normal text-gray-400">(optional)</span></label>
                            <input
                              type="number"
                              min={0}
                              max={23}
                              value={facility.primeTimeStart ?? ""}
                              placeholder="e.g. 17"
                              onChange={(e) => updateFacility(idx, { primeTimeStart: e.target.value === "" ? undefined : Number(e.target.value) })}
                              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Operating Hours */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Operating Hours</span>
                            {facility.operatingHours ? (
                              <button
                                type="button"
                                onClick={() => clearFacilityHours(idx)}
                                className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                              >
                                Use business hours
                              </button>
                            ) : null}
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
                                    onChange={(e) => updateFacilityHours(idx, dayIdx, { open: e.target.value })}
                                    className="w-24 px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-900 outline-none focus:border-gray-400 transition-colors disabled:opacity-40 disabled:bg-gray-50"
                                  />
                                  <span className="text-gray-400 text-xs">–</span>
                                  <input
                                    type="text"
                                    value={oh.close}
                                    disabled={oh.closed}
                                    onChange={(e) => updateFacilityHours(idx, dayIdx, { close: e.target.value })}
                                    className="w-24 px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-900 outline-none focus:border-gray-400 transition-colors disabled:opacity-40 disabled:bg-gray-50"
                                  />
                                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={oh.closed ?? false}
                                      onChange={(e) => updateFacilityHours(idx, dayIdx, { closed: e.target.checked })}
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
                                onClick={() => initFacilityHours(idx)}
                                className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                              >
                                Override for this court
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Remove court */}
                        <div className="pt-1">
                          {courtRemoveConfirm === facility.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">Remove this court?</span>
                              <button
                                type="button"
                                onClick={() => removeFacility(idx)}
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
                onClick={addFacility}
                className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-dashed border-gray-200 text-sm font-semibold text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
              >
                <Plus size={15} />
                Add court
              </button>
            </div>
          )}
        </div>

        {/* ── Section C: Amenities ──────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
          <SectionHeader title="Amenities" open={sectionOpen.amenities} onToggle={() => toggleSection("amenities")} />
          {sectionOpen.amenities && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {draft.amenities.map((amenity, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-700"
                  >
                    {amenity}
                    <button
                      type="button"
                      onClick={() => removeAmenity(idx)}
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                      aria-label={`Remove ${amenity}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {draft.amenities.length === 0 && (
                  <p className="text-xs text-gray-400">No amenities added yet.</p>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={amenityInput}
                  onChange={(e) => setAmenityInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAmenity(); } }}
                  placeholder="Add amenity..."
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={addAmenity}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Fixed Save Bar ───────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="text-sm">
          {saveResult === "success" && (
            <span className="text-green-600 font-semibold">Changes saved successfully.</span>
          )}
          {saveResult === "error" && (
            <span className="text-red-500 font-semibold">Failed to save. Please try again.</span>
          )}
        </div>
        <button
          data-testid="settings-save-btn"
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: draft.accentColor }}
        >
          {saving ? (
            <>
              <span
                className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin inline-block"
                style={{ borderColor: `rgba(255,255,255,0.6) transparent transparent transparent` }}
              />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </div>
    </div>
  );
}
