"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import AuthModal from "@/components/auth/AuthModal";

export default function LandingNav() {
  const { user, loading, adminSlugs } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-black text-blue-600 tracking-tight">
          book<span className="text-gray-900">it</span>
        </Link>

        <nav className="flex items-center gap-3">
          {!loading && (
            user ? (
              <div className="flex items-center gap-3">
                {adminSlugs.length > 0 && (
                  <Link
                    href={`/${adminSlugs[0]}/admin`}
                    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors hidden sm:block"
                  >
                    Dashboard
                  </Link>
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700">
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0">
                    {(user.displayName ?? user.email ?? "U").charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:block max-w-[120px] truncate">
                    {user.displayName ?? user.email}
                  </span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Sign in
              </button>
            )
          )}
        </nav>
      </div>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} accentColor="#2563EB" />
    </header>
  );
}
