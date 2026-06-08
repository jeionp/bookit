"use client";

import { WizardDraft } from "../OnboardingWizard";

interface Props {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
  onBack: () => void;
  onNext: () => void;
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 bg-white cursor-pointer hover:bg-gray-50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="relative shrink-0 mt-0.5">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="w-10 h-6 rounded-full transition-colors bg-gray-200 peer-checked:bg-blue-600" />
        <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </div>
    </label>
  );
}

export default function Step4Payments({ draft, patch, onBack, onNext }: Props) {
  const noneSelected = !draft.accepts_qr && !draft.accepts_cash && !draft.accepts_gateway;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Payment Options</h2>
        <p className="text-sm text-gray-500 mt-1">
          Choose how customers can pay for their bookings. You can change these later in Settings.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <ToggleRow
          label="QR Code"
          description="Customers upload a GCash or bank transfer screenshot. You review and confirm each booking manually. Upload your QR image in Settings after setup."
          checked={draft.accepts_qr}
          onChange={(v) => patch({ accepts_qr: v })}
        />
        <ToggleRow
          label="Pay at Venue"
          description="Customers pay cash on the day. You mark bookings as paid in the admin dashboard."
          checked={draft.accepts_cash}
          onChange={(v) => patch({ accepts_cash: v })}
        />
        <ToggleRow
          label="Online Gateway"
          description="Customers pay online via credit/debit card or e-wallet. Requires gateway credentials configured in Settings."
          checked={draft.accepts_gateway}
          onChange={(v) => patch({ accepts_gateway: v })}
        />
      </div>

      <details className="group border border-indigo-100 bg-indigo-50 rounded-xl text-xs text-indigo-700 open:pb-3">
        <summary className="cursor-pointer select-none list-none flex items-center justify-between px-4 py-3 font-semibold">
          <span>How serbi credits work</span>
          <span className="text-indigo-400 group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-4 flex flex-col gap-1.5 leading-relaxed">
          <p>Each confirmed booking deducts <strong>1 credit</strong> from your business wallet.</p>
          <p>Credits are <strong>not</strong> charged for cancellations — only confirmed bookings count.</p>
          <p>Top up anytime from the <strong>Payments tab</strong> in your admin dashboard. You start with free credits to get going.</p>
        </div>
      </details>

      {noneSelected && (
        <p className="text-xs text-amber-600">Select at least one payment method to continue.</p>
      )}

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
          disabled={noneSelected}
          className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
