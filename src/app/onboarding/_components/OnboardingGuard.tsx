"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AuthModal from "@/components/auth/AuthModal";

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-gray-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-sm flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
            🚀
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Set up your business</h1>
            <p className="text-sm text-gray-500 mt-1">
              Sign in or create an account to get started.
            </p>
          </div>
          <button
            onClick={() => setShowAuth(true)}
            className="w-full px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Sign in / Create account
          </button>
        </div>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} accentColor="#2563EB" />
      </div>
    );
  }

  return <>{children}</>;
}
