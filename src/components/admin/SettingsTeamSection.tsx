"use client";

import { useEffect, useState } from "react";
import { UserCheck, Mail } from "lucide-react";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { SectionHeader } from "./SettingsShared";
import type { TeamMember } from "@/app/api/admin-team/route";

export default function SettingsTeamSection({
  businessSlug,
  businessName,
  open,
  onToggle,
}: {
  businessSlug: string;
  businessName: string;
  open:         boolean;
  onToggle:     () => void;
}) {
  const authedFetch = useAuthedFetch();

  // null = not yet loaded
  const [members, setMembers] = useState<TeamMember[] | null>(null);

  const [inviteEmail, setInviteEmail]     = useState("");
  const [inviting, setInviting]           = useState(false);
  const [inviteResult, setInviteResult]   = useState<"sent" | "error" | null>(null);
  const [inviteError, setInviteError]     = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    authedFetch(`/api/admin-team?slug=${encodeURIComponent(businessSlug)}`)
      .then((r) => r.json() as Promise<{ members: TeamMember[] }>)
      .then(({ members: m }) => { if (!cancelled) setMembers(m); })
      .catch(() => { if (!cancelled) setMembers([]); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, businessSlug]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteResult(null);
    setInviteError("");
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await authedFetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), businessSlug, businessName }),
      });
      if (res.ok) {
        setInviteResult("sent");
        setInviteEmail("");
      } else {
        const body = await res.json() as { error?: string };
        setInviteError(body.error ?? "Failed to send invite");
        setInviteResult("error");
      }
    } catch {
      setInviteError("Network error — please try again.");
      setInviteResult("error");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
      <SectionHeader title="Team Members" open={open} onToggle={onToggle} />
      {open && (
        <div className="space-y-5">
          {/* Current admins */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Current Admins
            </p>
            {members === null && (
              <div className="flex items-center justify-center py-4">
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-gray-300 animate-spin" />
              </div>
            )}
            {members !== null && members.length === 0 && (
              <p className="text-xs text-gray-400">No admins found.</p>
            )}
            {members !== null && members.length > 0 && (
              <div className="divide-y divide-gray-100">
                {members.map((m) => (
                  <div key={m.uid} className="flex items-center gap-2.5 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <UserCheck size={13} className="text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{m.displayName}</p>
                      <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invite form */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Invite a New Admin
            </p>
            <form onSubmit={(e) => void handleInvite(e)} className="space-y-2">
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  data-testid="invite-email-input"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteResult(null); }}
                  placeholder="colleague@example.com"
                  required
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 transition-colors bg-white"
                />
              </div>
              {inviteResult === "sent" && (
                <p className="text-xs text-green-600 font-medium" data-testid="invite-success">
                  Invite sent! They&apos;ll receive an email with a link to accept.
                </p>
              )}
              {inviteResult === "error" && (
                <p className="text-xs text-red-500">{inviteError}</p>
              )}
              <button
                data-testid="invite-submit-btn"
                type="submit"
                disabled={inviting}
                className="w-full py-2 rounded-xl text-xs font-bold text-white bg-gray-900 hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {inviting ? "Sending…" : "Send Invite"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
