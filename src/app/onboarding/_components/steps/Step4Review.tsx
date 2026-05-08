"use client";

import { WizardDraft } from "../OnboardingWizard";

interface Props {
  draft: WizardDraft;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="text-xs font-semibold text-gray-400 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 break-all">{value}</span>
    </div>
  );
}

export default function Step4Review({ draft, onBack, onSubmit, submitting, error }: Props) {
  const openDays = draft.operatingHours.filter((h) => !h.closed);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Review & Launch</h2>
        <p className="text-sm text-gray-500 mt-1">Double-check everything before going live.</p>
      </div>

      {/* Business info */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Business Info</h3>
        <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-2">
          <Row label="Name" value={draft.name} />
          <Row label="URL" value={`bookit.app/${draft.slug}`} />
          <Row label="Type" value={draft.type} />
          <Row label="Tagline" value={draft.tagline} />
          <Row label="Description" value={draft.description} />
          <Row label="Location" value={draft.location} />
          <Row label="Address" value={draft.address} />
          <Row label="Phone" value={draft.phone} />
          <Row label="Email" value={draft.email} />
        </div>
      </section>

      {/* Branding */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Branding</h3>
        <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
          {draft.coverImage ? (
            <img
              src={draft.coverImage}
              alt="Cover"
              className="w-full h-24 object-cover rounded-lg"
            />
          ) : (
            <p className="text-sm text-gray-400 italic">No cover image</p>
          )}
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: draft.accentColor }} />
            <span className="text-sm text-gray-700 font-mono">{draft.accentColor}</span>
          </div>
        </div>
      </section>

      {/* Facilities */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">
          Facilities ({draft.facilities.length})
        </h3>
        <div className="flex flex-col gap-2">
          {draft.facilities.map((f) => (
            <div key={f.id} className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">{f.name}</p>
                {f.description && <p className="text-xs text-gray-500 mt-0.5">{f.description}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-800">₱{f.pricePerHour}/hr</p>
                {f.primePricePerHour && (
                  <p className="text-xs text-gray-500">Prime: ₱{f.primePricePerHour}/hr</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Operating hours summary */}
      {openDays.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Operating Hours</h3>
          <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-1.5">
            {draft.operatingHours.map((h) => (
              <div key={h.day} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 w-24">{h.day}</span>
                {h.closed ? (
                  <span className="text-gray-400 italic text-xs">Closed</span>
                ) : (
                  <span className="text-gray-800">{h.open} – {h.close}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Amenities */}
      {draft.amenities.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Amenities</h3>
          <div className="flex flex-wrap gap-2">
            {draft.amenities.map((a) => (
              <span key={a} className="px-3 py-1 rounded-full bg-gray-100 text-xs text-gray-700 font-medium">
                {a}
              </span>
            ))}
          </div>
        </section>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {submitting && (
            <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          )}
          {submitting ? "Launching…" : "🚀 Launch my business"}
        </button>
      </div>
    </div>
  );
}
