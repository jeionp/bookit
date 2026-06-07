"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Business, Facility, OperatingHours } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import ImageUpload from "@/components/shared/ImageUpload";
import { linkWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { SectionHeader, LabeledInput } from "./SettingsShared";
import { DAYS, defaultOperatingHours } from "@/lib/slots";
import SettingsCourtsSection from "./SettingsCourtsSection";
import SettingsPaymentSection from "./SettingsPaymentSection";
import SettingsCreditsSection from "./SettingsCreditsSection";


export default function AdminSettingsView({ business }: { business: Business }) {
  const { user } = useAuth();
  const authedFetch = useAuthedFetch();

  const [draft, setDraft] = useState<Business>(() => JSON.parse(JSON.stringify(business)));

  const [sectionOpen, setSectionOpen] = useState({
    info: true,
    courts: true,
    amenities: true,
    payment: true,
    credits: false,
  });

  const isGoogleLinked = user?.providerData.some((p) => p.providerId === "google.com") ?? false;
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkResult, setLinkResult] = useState<"success" | "error" | null>(null);

  const [amenityInput, setAmenityInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);

  async function handleLinkGoogle() {
    setLinkLoading(true);
    setLinkResult(null);
    try {
      await linkWithPopup(auth.currentUser!, new GoogleAuthProvider());
      setLinkResult("success");
    } catch {
      setLinkResult("error");
    } finally {
      setLinkLoading(false);
    }
  }

  function toggleSection(key: keyof typeof sectionOpen) {
    setSectionOpen((s) => ({ ...s, [key]: !s[key] }));
  }

  function setField<K extends keyof Business>(key: K, value: Business[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function updateFacility(idx: number, patch: Partial<Facility>) {
    setDraft((d) => {
      const facilities = [...d.facilities];
      facilities[idx] = { ...facilities[idx], ...patch };
      return { ...d, facilities };
    });
  }

  function removeFacility(idx: number) {
    setDraft((d) => ({ ...d, facilities: d.facilities.filter((_, i) => i !== idx) }));
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
  }

  function updateFacilityHours(facilityIdx: number, dayIdx: number, patch: Partial<OperatingHours>) {
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
    const filled = DAYS.map((day) => base.find((h: OperatingHours) => h.day === day) ?? { day, open: "6:00 AM", close: "10:00 PM", closed: false });
    updateFacility(facilityIdx, { operatingHours: filled });
  }

  function clearFacilityHours(facilityIdx: number) {
    updateFacility(facilityIdx, { operatingHours: undefined });
  }

  function removeAmenity(idx: number) {
    setDraft((d) => ({ ...d, amenities: d.amenities.filter((_, i) => i !== idx) }));
  }

  function addAmenity() {
    const trimmed = amenityInput.trim();
    if (!trimmed || draft.amenities.includes(trimmed)) return;
    setDraft((d) => ({ ...d, amenities: [...d.amenities, trimmed] }));
    setAmenityInput("");
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await authedFetch(`/api/businesses/${draft.slug}`, {
        method: "PATCH",
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

        {/* Business Info */}
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
                  rows={6}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors resize-none"
                />
              </div>
              <LabeledInput label="Location" value={draft.location} onChange={(v) => setField("location", v)} />
              <LabeledInput label="Address" value={draft.address} onChange={(v) => setField("address", v)} />
              <div className="sm:col-span-2">
                <LabeledInput
                  label="Map Embed URL (optional)"
                  value={draft.mapUrl ?? ""}
                  onChange={(v) => setField("mapUrl", v || null)}
                  placeholder="Leave blank to auto-generate from Address"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  To pin an exact location: open Google Maps → click the pin → Share → Embed a map → copy the <code className="font-mono">src</code> URL from the iframe code.
                </p>
              </div>
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

        <SettingsCourtsSection
          facilities={draft.facilities}
          businessSlug={draft.slug}
          open={sectionOpen.courts}
          onToggle={() => toggleSection("courts")}
          onAdd={addFacility}
          onRemove={removeFacility}
          onUpdate={updateFacility}
          onUpdateHours={updateFacilityHours}
          onInitHours={initFacilityHours}
          onClearHours={clearFacilityHours}
        />

        {/* Amenities */}
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

        <SettingsPaymentSection
          draft={draft}
          setDraft={setDraft}
          user={user}
          open={sectionOpen.payment}
          onToggle={() => toggleSection("payment")}
        />

        <SettingsCreditsSection
          businessSlug={business.slug}
          user={user}
          open={sectionOpen.credits}
          onToggle={() => toggleSection("credits")}
        />

        {!isGoogleLinked && (
          <div className="mx-4 mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50">
            <p className="text-xs font-bold text-amber-800 mb-1">Link Google Sign-in</p>
            <p className="text-xs text-amber-700 mb-3">
              Connect your Google account so you can sign in with Google instead of email + password.
              Your admin access and all data are preserved.
            </p>
            {linkResult === "success" && (
              <p className="text-xs font-semibold text-green-700 mb-2">
                Google account linked successfully. You can now sign in with Google.
              </p>
            )}
            {linkResult === "error" && (
              <p className="text-xs font-semibold text-red-600 mb-2">
                Linking failed. Make sure you select the correct Google account and try again.
              </p>
            )}
            {linkResult !== "success" && (
              <button
                onClick={() => void handleLinkGoogle()}
                disabled={linkLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                {linkLoading ? "Opening Google…" : "Link Google Account"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Fixed Save Bar */}
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
