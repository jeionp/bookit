"use client";

import ImageUpload from "@/components/shared/ImageUpload";
import { WizardDraft } from "../OnboardingWizard";

const PRESET_COLORS = [
  "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899",
  "#EF4444", "#F97316", "#EAB308", "#22C55E",
  "#14B8A6", "#06B6D4",
];

interface Props {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function Step2Branding({ draft, patch, onBack, onNext }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Branding</h2>
        <p className="text-sm text-gray-500 mt-1">Customize how your page looks to customers.</p>
      </div>

      <div className="flex flex-col gap-6">
        <ImageUpload
          label="Cover image"
          value={draft.coverImage}
          onChange={(url) => patch({ coverImage: url })}
          path={`businesses/${draft.slug}/cover`}
          hint="Recommended: 1200 × 400 px. Shown at the top of your booking page."
        />

        {/* Cover preview */}
        {draft.coverImage && (
          <div
            className="w-full h-28 rounded-xl bg-cover bg-center border border-gray-200"
            style={{ backgroundImage: `url(${draft.coverImage})` }}
          />
        )}

        {/* Accent color */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500">Accent color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => patch({ accentColor: c })}
                className={[
                  "w-8 h-8 rounded-full border-2 transition-transform",
                  draft.accentColor === c ? "border-gray-800 scale-110" : "border-transparent hover:scale-105",
                ].join(" ")}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
            <input
              type="color"
              value={draft.accentColor}
              onChange={(e) => patch({ accentColor: e.target.value })}
              className="w-8 h-8 rounded-full border-2 border-gray-200 cursor-pointer p-0.5 bg-white"
              title="Custom color"
            />
          </div>

          {/* Color preview chip */}
          <div className="flex items-center gap-2 mt-1">
            <div
              className="w-4 h-4 rounded-full shrink-0"
              style={{ backgroundColor: draft.accentColor }}
            />
            <span className="text-xs text-gray-500 font-mono">{draft.accentColor}</span>
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: draft.accentColor }}
            >
              Book now
            </span>
          </div>
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
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Next: Facilities →
        </button>
      </div>
    </div>
  );
}
