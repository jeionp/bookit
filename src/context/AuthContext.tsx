"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { getAdminSlugs } from "@/lib/firebase/admin";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  adminSlugs: string[];
  isAdminOf: (slug: string) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  adminSlugs: [],
  isAdminOf: () => false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminSlugs, setAdminSlugs] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Retry up to 3 times on transient WebChannel/emulator failures.
        // Non-admin users return [] on success (no throw), so retries only fire
        // for genuine connection errors, not for "user has no admin doc".
        let slugs: string[] = [];
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            slugs = await getAdminSlugs(firebaseUser.uid);
            break;
          } catch {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }
        setAdminSlugs(slugs);
      } else {
        setAdminSlugs([]);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const isAdminOf = useCallback(
    (slug: string) => adminSlugs.includes(slug),
    [adminSlugs]
  );

  async function signOut() {
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, loading, adminSlugs, isAdminOf, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
