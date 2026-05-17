import { Suspense } from "react";
import StubCheckoutClient from "./StubCheckoutClient";

export default function StubCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-sm text-gray-400">Loading payment page…</p>
        </div>
      }
    >
      <StubCheckoutClient />
    </Suspense>
  );
}
