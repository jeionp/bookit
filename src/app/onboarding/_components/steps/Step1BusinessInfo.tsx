"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, XCircle, Loader } from "lucide-react";
import { slugify, isValidSlug } from "@/lib/slugify";
import { WizardDraft } from "../OnboardingWizard";

const BUSINESS_TYPES = [
  { value: "court", label: "Sports Court" },
  { value: "appointment", label: "Appointment-based" },
  { value: "room", label: "Room / Space" },
] as const;

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
      />
    </div>
  );
}

interface Props {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
  onNext: () => void;
}

export default function Step1BusinessInfo({ draft, patch, onNext }: Props) {
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-derive slug from name unless user has manually edited it
  useEffect(() => {
    if (slugEdited) return;
    const derived = slugify(draft.name);
    if (derived !== draft.slug) {
      patch({ slug: derived });
      setSlugStatus("idle");
    }
  }, [draft.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced availability check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!draft.slug) { setSlugStatus("idle"); return; }
    if (!isValidSlug(draft.slug)) { setSlugStatus("invalid"); return; }

    setSlugStatus("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/onboarding/check-slug?slug=${encodeURIComponent(draft.slug)}`);
        const json = await res.json();
        setSlugStatus(json.available ? "available" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [draft.slug]);

  function handleSlugChange(v: string) {
    setSlugEdited(true);
    patch({ slug: v.toLowerCase().replace(/[^a-z0-9-]/g, "") });
  }

  const canProceed =
    draft.name.trim().length > 0 &&
    slugStatus === "available";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Business Info</h2>
        <p className="text-sm text-gray-500 mt-1">Basic details about your business.</p>
      </div>

      <div className="flex flex-col gap-4">
        <LabeledInput
          label="Business name"
          value={draft.name}
          onChange={(v) => patch({ name: v })}
          placeholder="e.g. Ace Courts Manila"
          required
        />

        {/* Slug field */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">
            URL slug<span className="text-red-400 ml-0.5">*</span>
          </label>
          <div className="flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden focus-within:border-gray-400 transition-colors">
            <span className="px-3 py-2 text-sm text-gray-400 border-r border-gray-200 select-none bg-gray-50">
              bookit.app/
            </span>
            <input
              type="text"
              value={draft.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="your-business"
              className="flex-1 px-3 py-2 text-sm text-gray-900 outline-none bg-transparent"
            />
            <div className="px-3">
              {slugStatus === "checking" && <Loader size={14} className="text-gray-400 animate-spin" />}
              {slugStatus === "available" && <CheckCircle size={14} className="text-green-500" />}
              {(slugStatus === "taken" || slugStatus === "invalid") && <XCircle size={14} className="text-red-400" />}
            </div>
          </div>
          <p className="text-xs mt-0.5">
            {slugStatus === "available" && <span className="text-green-600">Available</span>}
            {slugStatus === "taken" && <span className="text-red-500">Already taken — try another</span>}
            {slugStatus === "invalid" && <span className="text-red-500">Use lowercase letters, numbers, and hyphens only (min 3 chars)</span>}
            {(slugStatus === "idle" || slugStatus === "checking") && (
              <span className="text-gray-400">Your booking page will be at bookit.app/{draft.slug || "…"}</span>
            )}
          </p>
        </div>

        {/* Business type */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Business type</label>
          <div className="grid grid-cols-3 gap-2">
            {BUSINESS_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => patch({ type: value })}
                className={[
                  "py-2 px-3 rounded-xl border text-sm font-medium transition-colors",
                  draft.type === value
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <LabeledInput
          label="Tagline"
          value={draft.tagline}
          onChange={(v) => patch({ tagline: v })}
          placeholder="e.g. The best courts in the city"
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Description</label>
          <textarea
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Tell customers what makes your business special…"
            rows={3}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <LabeledInput
            label="City / Area"
            value={draft.location}
            onChange={(v) => patch({ location: v })}
            placeholder="e.g. Makati, Metro Manila"
          />
          <LabeledInput
            label="Full address"
            value={draft.address}
            onChange={(v) => patch({ address: v })}
            placeholder="Street address"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <LabeledInput
            label="Phone"
            value={draft.phone}
            onChange={(v) => patch({ phone: v })}
            type="tel"
            placeholder="+63 912 345 6789"
          />
          <LabeledInput
            label="Email"
            value={draft.email}
            onChange={(v) => patch({ email: v })}
            type="email"
            placeholder="hello@yourbusiness.com"
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-blue-700 transition-colors"
        >
          Next: Branding →
        </button>
      </div>
    </div>
  );
}
