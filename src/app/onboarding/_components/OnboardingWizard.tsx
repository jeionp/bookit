"use client";

import { useState } from "react";
import { LogOut, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Facility, OperatingHours } from "@/lib/types";
import StepIndicator from "./StepIndicator";
import Step1BusinessInfo from "./steps/Step1BusinessInfo";
import Step2Branding from "./steps/Step2Branding";
import Step3Facilities from "./steps/Step3Facilities";
import Step4Review from "./steps/Step4Review";

export interface WizardDraft {
  // Step 1
  name: string;
  slug: string;
  type: "court" | "appointment" | "room";
  description: string;
  tagline: string;
  location: string;
  address: string;
  phone: string;
  email: string;
  // Step 2
  coverImage: string;
  accentColor: string;
  // Step 3
  facilities: Facility[];
  operatingHours: OperatingHours[];
  amenities: string[];
}

const INITIAL: WizardDraft = {
  name: "",
  slug: "",
  type: "court",
  description: "",
  tagline: "",
  location: "",
  address: "",
  phone: "",
  email: "",
  coverImage: "",
  accentColor: "#3B82F6",
  facilities: [],
  operatingHours: [],
  amenities: [],
};

export default function OnboardingWizard() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function patch(partial: Partial<WizardDraft>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  function handleExit() {
    const isDirty = step > 0 || draft.name.trim().length > 0;
    if (isDirty && !window.confirm("Exit setup? Your progress will be lost.")) return;
    router.push("/");
  }

  async function submit() {
    if (!user) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      window.location.replace(`/${json.slug}/admin`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Nav */}
      <header className="bg-white border-b border-gray-100 px-4 h-14 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-base font-black tracking-tight text-gray-900">bookit</span>
          <button
            onClick={handleExit}
            className="flex items-center gap-1 text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X size={14} />
            <span className="hidden sm:inline">Exit setup</span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-xs text-gray-400 truncate max-w-[180px]">
            {user?.email}
          </span>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="flex flex-col items-center py-8 px-4 sm:py-12">
        <div className="w-full max-w-2xl flex flex-col gap-6 sm:gap-8">
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Set up your business</h1>
            <p className="text-sm text-gray-500">Tell us about your business to get started.</p>
          </div>

          <div className="flex justify-center">
            <StepIndicator current={step} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
            {step === 0 && <Step1BusinessInfo draft={draft} patch={patch} onNext={() => setStep(1)} />}
            {step === 1 && <Step2Branding draft={draft} patch={patch} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
            {step === 2 && <Step3Facilities draft={draft} patch={patch} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
            {step === 3 && (
              <Step4Review
                draft={draft}
                onBack={() => setStep(2)}
                onSubmit={submit}
                submitting={submitting}
                error={submitError}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
