"use client";

import { useState, useEffect, useCallback } from "react";
import { Business, CreditLedgerEntry } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RevenueSummary = {
  count: number;
  revenue: number;
};

type RevenueResponse = {
  totals: Record<string, RevenueSummary>;
  grand: RevenueSummary;
  currency: string;
};

type AuditBooking = {
  id: string;
  userName: string;
  userEmail: string;
  facilityName: string;
  date: string;
  hours: number[];
  totalPrice: number;
  currency: string;
  status: string;
  checkout_type: string | null;
  payment_status_v2: string | null;
  held_until: string | null;
  createdAt: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHECKOUT_LABELS: Record<string, string> = {
  P2P_AI: "GCash QR",
  PAY_AT_VENUE: "Pay at Venue",
  GATEWAY_SPLIT: "Online Gateway",
  instant: "Instant",
};

const STATUS_LABELS: Record<string, string> = {
  pending_proof: "Pending Proof",
  ai_review: "AI Review",
  paid: "Paid",
  rejected: "Rejected",
  pending_cash: "Pending Cash",
  pending_gateway: "Pending Gateway",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  paid:            { bg: "#f0fdf4", color: "#16a34a" },
  pending_proof:   { bg: "#fefce8", color: "#ca8a04" },
  ai_review:       { bg: "#eff6ff", color: "#2563eb" },
  pending_cash:    { bg: "#fefce8", color: "#ca8a04" },
  pending_gateway: { bg: "#f5f3ff", color: "#7c3aed" },
  rejected:        { bg: "#fef2f2", color: "#dc2626" },
};

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function triggerLabel(trigger: string): string {
  const labels: Record<string, string> = {
    gateway_webhook: "Gateway Payment",
    ai_verify: "AI Verification",
    admin_approve: "Admin Approved",
    admin_mark_paid: "Admin Marked Paid",
  };
  return labels[trigger] ?? trigger;
}

// ---------------------------------------------------------------------------
// Section: Revenue Summary
// ---------------------------------------------------------------------------

function RevenueSection({ business }: { business: Business }) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await window.fetch(
        `/api/admin/revenue?slug=${encodeURIComponent(business.slug)}&from=${from}&to=${to}`,
        { headers: { Authorization: `Bearer ${idToken}` } },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Failed to load revenue");
        return;
      }
      setData(await res.json() as RevenueResponse);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [user, business.slug, from, to]);

  useEffect(() => { void fetch(); }, [fetch]);

  const rows = data
    ? Object.entries(data.totals).filter(([, v]) => v.count > 0)
    : [];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="text-sm font-bold text-gray-900 mb-4">Revenue Summary</h2>

      {/* Date range controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">From</label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">To</label>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        <button
          onClick={() => void fetch()}
          disabled={loading}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50 transition-colors"
          style={{ backgroundColor: business.accentColor }}
        >
          {loading ? "Loading…" : "Apply"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 mb-3">{error}</p>
      )}

      {data && rows.length === 0 && (
        <p className="text-xs text-gray-400 py-4 text-center">No confirmed payments in this period.</p>
      )}

      {data && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 font-semibold text-gray-500">Payment Type</th>
                <th className="text-right py-2 font-semibold text-gray-500">Bookings</th>
                <th className="text-right py-2 font-semibold text-gray-500">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, val]) => (
                <tr key={key} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700">{CHECKOUT_LABELS[key] ?? key}</td>
                  <td className="py-2 text-right text-gray-700">{val.count}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">
                    {formatCurrency(val.revenue, data.currency)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50">
                <td className="py-2 font-bold text-gray-900">Total</td>
                <td className="py-2 text-right font-bold text-gray-900">{data.grand.count}</td>
                <td className="py-2 text-right font-bold text-gray-900">
                  {formatCurrency(data.grand.revenue, data.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Payment Audit
// ---------------------------------------------------------------------------

const AUDIT_STATUSES = [
  { value: null, label: "All" },
  { value: "pending_proof", label: "Pending Proof" },
  { value: "ai_review", label: "AI Review" },
  { value: "pending_cash", label: "Pending Cash" },
  { value: "pending_gateway", label: "Pending Gateway" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
];

function PaymentAuditSection({ business }: { business: Business }) {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [bookings, setBookings] = useState<AuditBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAudit = useCallback(async (status: string | null) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams({ slug: business.slug });
      if (status) params.set("status", status);
      const res = await window.fetch(`/api/admin/payment-audit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Failed to load audit");
        return;
      }
      const json = await res.json() as { bookings: AuditBooking[] };
      setBookings(json.bookings);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [user, business.slug]);

  useEffect(() => { void fetchAudit(statusFilter); }, [fetchAudit, statusFilter]);

  function formatHours(hours: number[]): string {
    if (!hours.length) return "—";
    const fmt = (h: number) => {
      if (h === 0) return "12 AM";
      if (h < 12) return `${h} AM`;
      if (h === 12) return "12 PM";
      return `${h - 12} PM`;
    };
    return `${fmt(hours[0])}–${fmt(hours[hours.length - 1] + 1)}`;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="text-sm font-bold text-gray-900 mb-4">Payment Status Audit</h2>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {AUDIT_STATUSES.map(({ value, label }) => (
          <button
            key={String(value)}
            onClick={() => setStatusFilter(value)}
            className="text-xs font-semibold px-3 py-1 rounded-full border transition-colors"
            style={
              statusFilter === value
                ? { backgroundColor: business.accentColor, borderColor: business.accentColor, color: "#fff" }
                : { backgroundColor: "#fff", borderColor: "#e5e7eb", color: "#6b7280" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>}

      {!loading && !error && bookings.length === 0 && (
        <p className="text-xs text-gray-400 py-4 text-center">No bookings match this filter.</p>
      )}

      {!loading && bookings.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 font-semibold text-gray-500">Customer</th>
                <th className="text-left py-2 font-semibold text-gray-500">Facility / Date</th>
                <th className="text-left py-2 font-semibold text-gray-500">Type</th>
                <th className="text-left py-2 font-semibold text-gray-500">Status</th>
                <th className="text-right py-2 font-semibold text-gray-500">Amount</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const statusStyle = b.payment_status_v2
                  ? (STATUS_COLORS[b.payment_status_v2] ?? { bg: "#f9fafb", color: "#374151" })
                  : { bg: "#f0fdf4", color: "#16a34a" };
                return (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-3">
                      <p className="font-semibold text-gray-800">{b.userName}</p>
                      <p className="text-gray-400">{b.userEmail}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <p className="text-gray-700">{b.facilityName}</p>
                      <p className="text-gray-400">{b.date} · {formatHours(b.hours)}</p>
                    </td>
                    <td className="py-2 pr-3 text-gray-600">
                      {b.checkout_type ? (CHECKOUT_LABELS[b.checkout_type] ?? b.checkout_type) : "Instant"}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={statusStyle}
                      >
                        {b.payment_status_v2
                          ? (STATUS_LABELS[b.payment_status_v2] ?? b.payment_status_v2)
                          : b.status === "confirmed" ? "Paid" : b.status}
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold text-gray-900">
                      {formatCurrency(b.totalPrice, b.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Credit Ledger
// ---------------------------------------------------------------------------

function CreditLedgerSection({ business }: { business: Business }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<CreditLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const idToken = await user.getIdToken();
        const res = await window.fetch(
          `/api/admin/credit-ledger?slug=${encodeURIComponent(business.slug)}`,
          { headers: { Authorization: `Bearer ${idToken}` } },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError((body as { error?: string }).error ?? "Failed to load ledger");
          return;
        }
        const json = await res.json() as { entries: CreditLedgerEntry[] };
        setEntries(json.entries);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, business.slug]);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-900">SaaS Credit Ledger</h2>
        {typeof business.saas_credit_balance === "number" && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
            Balance: {business.saas_credit_balance} credits
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="text-xs text-gray-400 py-4 text-center">
          No ledger entries yet. Credits are deducted each time a booking is confirmed.
        </p>
      )}

      {!loading && entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 font-semibold text-gray-500">Date</th>
                <th className="text-left py-2 font-semibold text-gray-500">Trigger</th>
                <th className="text-left py-2 font-semibold text-gray-500">Booking</th>
                <th className="text-right py-2 font-semibold text-gray-500">Before</th>
                <th className="text-right py-2 font-semibold text-gray-500">After</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-gray-50">
                  <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                    {formatDate(e.createdAt)}
                  </td>
                  <td className="py-2 pr-3 text-gray-700">{triggerLabel(e.trigger)}</td>
                  <td className="py-2 pr-3 text-gray-400 font-mono">{e.bookingId.slice(0, 8)}…</td>
                  <td className="py-2 text-right text-gray-500">{e.balanceBefore}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">{e.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function AdminPaymentsView({ business }: { business: Business }) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <RevenueSection business={business} />
      <PaymentAuditSection business={business} />
      <CreditLedgerSection business={business} />
    </div>
  );
}
