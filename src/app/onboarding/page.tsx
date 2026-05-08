import OnboardingGuard from "./_components/OnboardingGuard";
import OnboardingWizard from "./_components/OnboardingWizard";

export const metadata = { title: "Set up your business — Bookit" };

export default function OnboardingPage() {
  return (
    <OnboardingGuard>
      <OnboardingWizard />
    </OnboardingGuard>
  );
}
