"use client";

import { useState, useEffect } from "react";
import { Coins, Ban } from "lucide-react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Credit } from "@/lib/types";
import { computeBalance } from "@/lib/firebase/credits";
import { SectionHeader } from "./SettingsShared";
import type { User } from "firebase/auth";

interface Props {
  businessSlug: string;
  user: User | null;
  open: boolean;
  onToggle: () => void;
}

export default function SettingsCreditsSection({ businessSlug, user, open, onToggle }: Props) {
  const [businessCredits, setBusinessCredits] = useState<Credit[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => setCreditsLoading(true), 0);
    const q = query(
      collection(db, "credits"),
      where("businessSlug", "==", businessSlug),
      orderBy("createdAt", "desc"),
    );
    getDocs(q)
      .then((snap) => setBusinessCredits(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Credit))))
      .catch(() => {})
      .finally(() => setCreditsLoading(false));
  }, [open, businessSlug]);

  async function handleVoidCredit(creditId: string) {
    if (!user) return;
    setVoidingId(creditId);
    try {
      const idToken = await user.getIdToken();
      await fetch("/api/admin/void-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ creditId }),
      });
      setBusinessCredits((prev) =>
        prev.map((c) => (c.id === creditId ? { ...c, voided: true } : c)),
      );
    } finally {
      setVoidingId(null);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
      <SectionHeader title="Customer Credits" open={open} onToggle={onToggle} />
      {open && (
        <div className="space-y-3">
          {creditsLoading && (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-gray-300 animate-spin" />
            </div>
          )}

          {!creditsLoading && businessCredits.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No credits issued yet.</p>
          )}

          {!creditsLoading && (() => {
            const byUser: Record<string, { credits: Credit[]; userEmail: string }> = {};
            businessCredits.forEach((c) => {
              const key = c.userId;
              if (!byUser[key]) byUser[key] = { credits: [], userEmail: c.userId };
              byUser[key].credits.push(c);
            });
            return Object.entries(byUser).map(([userId, { credits }]) => {
              const balance = computeBalance(credits);
              const activeCredits = credits.filter((c) => c.type === "issued" && !c.voided);
              return (
                <div key={userId} className="rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <Coins size={14} className="text-amber-500" />
                      <span className="text-xs font-semibold text-gray-600 truncate max-w-[160px]">{userId}</span>
                    </div>
                    <span className="text-sm font-black text-amber-600">
                      {credits[0]?.currency ?? "PHP"} {balance.toLocaleString()} balance
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {activeCredits.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-gray-700">
                            {c.currency} {c.amount.toLocaleString()} — {c.reason}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            Expires {c.expiresAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleVoidCredit(c.id)}
                          disabled={voidingId === c.id}
                          className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                        >
                          <Ban size={10} />
                          {voidingId === c.id ? "Voiding…" : "Void"}
                        </button>
                      </div>
                    ))}
                    {activeCredits.length === 0 && (
                      <p className="text-xs text-gray-400 px-4 py-2.5">All credits redeemed or voided.</p>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
