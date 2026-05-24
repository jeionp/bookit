import { useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * Returns an authenticated fetch wrapper that automatically injects
 * `Authorization: Bearer <token>` and defaults Content-Type to application/json.
 * Callers can override or extend headers via the standard RequestInit.headers field.
 */
export function useAuthedFetch() {
  const { user } = useAuth();

  return useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      if (!user) throw new Error("Not authenticated");
      const idToken = await user.getIdToken();
      return fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...init?.headers,
          Authorization: `Bearer ${idToken}`,
        },
      });
    },
    [user],
  );
}
