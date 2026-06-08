"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  onAuthStateChanged,
  type User,
  type AuthError,
} from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { db, auth } from "@/lib/firebase/client";

interface InviteData {
  email:        string;
  businessSlug: string;
  businessName: string;
  inviterName:  string;
  expiresAt:    Timestamp;
  redeemedAt?:  Timestamp;
}

type PageState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "redeemed" }
  | { kind: "ready"; invite: InviteData }
  | { kind: "accepted"; businessSlug: string }
  | { kind: "error"; message: string };

type AuthMode = "signin" | "signup";

const FIREBASE_ERRORS: Record<string, string> = {
  "auth/invalid-credential":        "Incorrect email or password.",
  "auth/wrong-password":            "Incorrect email or password.",
  "auth/invalid-login-credentials": "Incorrect email or password.",
  "auth/user-not-found":            "Incorrect email or password.",
  "auth/email-already-in-use":      "An account with this email already exists.",
  "auth/weak-password":             "Password must be at least 6 characters.",
  "auth/invalid-email":             "Please enter a valid email address.",
  "auth/too-many-requests":         "Too many attempts. Please try again later.",
  "auth/popup-closed-by-user":      "",
};

function getAuthError(err: AuthError): string {
  return FIREBASE_ERRORS[err.code] ?? "Something went wrong. Please try again.";
}

export default function AcceptInviteClient() {
  const params     = useSearchParams();
  const router     = useRouter();
  const token      = params.get("token") ?? "";

  const [page, setPage]       = useState<PageState>({ kind: "loading" });
  const [user, setUser]       = useState<User | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted]   = useState(false);

  // Auth form state
  const [mode, setMode]             = useState<AuthMode>("signup");
  const [name, setName]             = useState("");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [authError, setAuthError]   = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Load invite
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) { if (!cancelled) setPage({ kind: "invalid" }); return; }
      try {
        const snap = await getDoc(doc(db, "invites", token));
        if (cancelled) return;
        if (!snap.exists()) { setPage({ kind: "invalid" }); return; }
        const data = snap.data() as InviteData;
        if (data.redeemedAt) { setPage({ kind: "redeemed" }); return; }
        if (data.expiresAt.toMillis() < Date.now()) { setPage({ kind: "expired" }); return; }
        setPage({ kind: "ready", invite: data });
        setEmail(data.email);
      } catch {
        if (!cancelled) setPage({ kind: "invalid" });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  // Track auth state
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  async function acceptInvite(u: User) {
    setAccepting(true);
    try {
      const idToken = await u.getIdToken();
      const res = await fetch("/api/accept-invite", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body:    JSON.stringify({ token }),
      });
      const body = await res.json() as { ok?: boolean; businessSlug?: string; error?: string };
      if (!res.ok) {
        setPage({ kind: "error", message: body.error ?? "Failed to accept invite" });
        return;
      }
      setAccepted(true);
      setTimeout(() => router.push(`/${body.businessSlug}`), 1500);
    } catch {
      setPage({ kind: "error", message: "Network error — please try again." });
    } finally {
      setAccepting(false);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      let u: User;
      if (mode === "signin") {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        u = cred.user;
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        u = cred.user;
        if (name.trim()) await updateProfile(u, { displayName: name.trim() });
      }
      await acceptInvite(u);
    } catch (err) {
      setAuthError(getAuthError(err as AuthError));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogle() {
    setAuthError("");
    setAuthLoading(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await acceptInvite(cred.user);
    } catch (err) {
      const msg = getAuthError(err as AuthError);
      if (msg) setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (page.kind === "loading") {
    return <Shell><p className="text-gray-400 text-sm">Checking invite…</p></Shell>;
  }

  if (page.kind === "invalid") {
    return (
      <Shell>
        <h1 className="text-xl font-black text-gray-900 mb-2">Invalid invite link</h1>
        <p className="text-sm text-gray-500">This invite link is invalid or has already been used.</p>
      </Shell>
    );
  }

  if (page.kind === "expired") {
    return (
      <Shell>
        <h1 className="text-xl font-black text-gray-900 mb-2">Invite expired</h1>
        <p className="text-sm text-gray-500">This invite link has expired. Ask the admin to send a new one.</p>
      </Shell>
    );
  }

  if (page.kind === "redeemed") {
    return (
      <Shell>
        <h1 className="text-xl font-black text-gray-900 mb-2">Already accepted</h1>
        <p className="text-sm text-gray-500">This invite has already been used.</p>
      </Shell>
    );
  }

  if (page.kind === "error") {
    return (
      <Shell>
        <h1 className="text-xl font-black text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-red-600">{page.message}</p>
      </Shell>
    );
  }

  if (accepted) {
    return (
      <Shell>
        <p className="text-green-600 font-semibold text-sm">Admin access granted! Redirecting…</p>
      </Shell>
    );
  }

  const { invite } = page as { kind: "ready"; invite: InviteData };

  return (
    <Shell>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">{invite.businessName}</p>
        <h1 className="text-2xl font-black text-gray-900 leading-tight">
          You&apos;ve been invited!
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          <strong>{invite.inviterName}</strong> invited you to manage{" "}
          <strong>{invite.businessName}</strong> on serbi.
        </p>
      </div>

      {user ? (
        /* Already signed in — just accept */
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Signed in as <strong>{user.email}</strong>
          </p>
          <button
            onClick={() => acceptInvite(user)}
            disabled={accepting}
            className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gray-900 hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {accepting ? "Accepting…" : "Accept Invitation"}
          </button>
        </div>
      ) : (
        /* Sign in / sign up form */
        <div>
          {/* Mode tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
            {(["signup", "signin"] as AuthMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setAuthError(""); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {m === "signup" ? "Create Account" : "Sign In"}
              </button>
            ))}
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Juan dela Cruz"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 transition-colors bg-white"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 transition-colors bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 transition-colors bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {authError && <p className="text-xs text-red-600">{authError}</p>}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gray-900 hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {authLoading
                ? "Please wait…"
                : mode === "signup"
                ? "Create Account & Accept"
                : "Sign In & Accept"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={authLoading}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8">
        {children}
      </div>
    </div>
  );
}
