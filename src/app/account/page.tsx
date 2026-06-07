"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, Coins, ChevronRight, ArrowLeft, LogOut, Star } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import AuthModal from "@/components/auth/AuthModal";
import { Booking, getUserBookings } from "@/lib/firebase/bookings";
import { getAllCreditsByUser, groupBalancesByBusiness } from "@/lib/firebase/credits";
import { getReviewedBookingIds } from "@/lib/firebase/reviews";
import CancelBookingModal from "@/components/booking/CancelBookingModal";
import { formatHour, formatDate } from "@/lib/slots";

function isBookingPast(booking: Booking): boolean {
  const now = new Date();
  const [y, m, d] = booking.date.split("-").map(Number);
  const bookingDay = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (bookingDay < today) return true;
  if (bookingDay > today) return false;
  return now.getHours() >= booking.hours[booking.hours.length - 1] + 1;
}

function totalSpend(bookings: Booking[]): number {
  return bookings
    .filter((b) => b.status === "confirmed")
    .reduce((sum, b) => sum + b.totalPrice, 0);
}

function favBusiness(bookings: Booking[]): string | null {
  const counts: Record<string, number> = {};
  bookings
    .filter((b) => b.status === "confirmed")
    .forEach((b) => { counts[b.businessName] = (counts[b.businessName] ?? 0) + 1; });
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

export default function AccountPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const authedFetch = useAuthedFetch();
  const [authOpen, setAuthOpen] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [creditBalances, setCreditBalances] = useState<
    Record<string, { balance: number; currency: string; businessName: string }>
  >({});
  const [dataLoading, setDataLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    setTimeout(() => setDataLoading(true), 0);
    Promise.all([
      getUserBookings(user.uid),
      getAllCreditsByUser(user.uid),
    ])
      .then(async ([bkgs, credits]) => {
        setBookings(bkgs);
        setCreditBalances(groupBalancesByBusiness(credits));
        // Load reviewed booking IDs for all businesses with past confirmed bookings
        const pastSlugs = [
          ...new Set(
            bkgs
              .filter((b) => b.status === "confirmed" && isBookingPast(b))
              .map((b) => b.businessSlug),
          ),
        ];
        const idSets = await Promise.all(
          pastSlugs.map((slug) => getReviewedBookingIds(slug, user.uid)),
        );
        const merged = new Set<string>();
        idSets.forEach((s) => s.forEach((id) => merged.add(id)));
        setReviewedIds(merged);
      })
      .catch(() => setFetchError(true))
      .finally(() => setDataLoading(false));
  }, [user]);

  function markReviewed(bookingId: string) {
    setReviewedIds((prev) => new Set([...prev, bookingId]));
  }

  function handleCancelled(bookingId: string, creditIssued: number, currency: string) {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" } : b)),
    );
    if (creditIssued > 0) {
      const booking = bookings.find((b) => b.id === bookingId);
      if (booking) {
        setCreditBalances((prev) => {
          const existing = prev[booking.businessSlug];
          return {
            ...prev,
            [booking.businessSlug]: {
              balance: (existing?.balance ?? 0) + creditIssued,
              currency,
              businessName: booking.businessName,
            },
          };
        });
      }
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-gray-300 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <Coins size={40} className="text-gray-200" />
        <p className="text-base font-bold text-gray-700">Sign in to view your account</p>
        <p className="text-sm text-gray-400 text-center max-w-xs">
          Track your bookings and credits across all venues in one place.
        </p>
        <button
          onClick={() => setAuthOpen(true)}
          className="px-6 py-2.5 rounded-full text-sm font-bold text-white bg-gray-900 hover:bg-gray-700 transition-colors"
        >
          Sign in
        </button>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  const upcoming = bookings.filter((b) => b.status === "confirmed" && !isBookingPast(b));
  const past     = bookings.filter((b) => b.status === "confirmed" &&  isBookingPast(b));
  const pastSlice = showPast ? past : past.slice(0, 5);
  const creditEntries = Object.entries(creditBalances).filter(([, v]) => v.balance > 0);
  const spend = totalSpend(bookings);
  const fav = favBusiness(bookings);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/" className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black text-gray-900">My Account</h1>
          <p className="text-xs text-gray-400 truncate">{user.email}</p>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors shrink-0"
        >
          <LogOut size={15} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Stats strip */}
        {bookings.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-4 flex flex-col items-center justify-center text-center border border-gray-100 min-h-[80px]">
              <p className="text-2xl font-black text-gray-900">{bookings.filter((b) => b.status === "confirmed").length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Bookings</p>
            </div>
            <div className="bg-white rounded-2xl p-4 flex flex-col items-center justify-center text-center border border-gray-100 min-h-[80px]">
              <p className="text-2xl font-black text-gray-900">
                ₱{spend >= 1000 ? `${(spend / 1000).toFixed(1)}k` : spend.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Total spent</p>
            </div>
            <div className="bg-white rounded-2xl p-4 flex flex-col items-center justify-center text-center border border-gray-100 min-h-[80px] overflow-hidden">
              <p className="text-sm font-black text-gray-900 leading-snug line-clamp-2">{fav ?? "—"}</p>
              <p className="text-xs text-gray-400 mt-0.5">Fav venue</p>
            </div>
          </div>
        )}

        {/* Credits */}
        {creditEntries.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
              Your Credits
            </h2>
            <div className="space-y-2">
              {creditEntries.map(([slug, { balance, currency, businessName }]) => (
                <Link
                  key={slug}
                  href={`/${slug}`}
                  className="flex items-center justify-between bg-white rounded-2xl p-4 border border-gray-100 hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
                      <Coins size={16} className="text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{businessName}</p>
                      <p className="text-xs text-gray-400">Redeemable at booking</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm font-black text-amber-600">
                      {currency} {balance.toLocaleString()}
                    </span>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Loading */}
        {dataLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-gray-300 animate-spin" />
          </div>
        )}

        {fetchError && (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-gray-600">Couldn&apos;t load your data</p>
            <p className="text-xs text-gray-400 mt-1">Please refresh the page</p>
          </div>
        )}

        {!dataLoading && !fetchError && (
          <>
            {/* Upcoming */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
                Upcoming ({upcoming.length})
              </h2>
              {upcoming.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
                  <CalendarDays size={28} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-sm text-gray-500">No upcoming bookings</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((b) => (
                    <AccountBookingCard
                      key={b.id}
                      booking={b}
                      variant="upcoming"
                      onCancel={() => setCancelTarget(b)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Past */}
            {past.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
                  Past ({past.length})
                </h2>
                <div className="space-y-3">
                  {pastSlice.map((b) => (
                    <AccountBookingCard
                      key={b.id}
                      booking={b}
                      variant="past"
                      isReviewed={reviewedIds.has(b.id)}
                      onReviewed={() => markReviewed(b.id)}
                      authedFetch={authedFetch}
                    />
                  ))}
                </div>
                {past.length > 5 && (
                  <button
                    onClick={() => setShowPast((v) => !v)}
                    className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold text-gray-500 bg-white border border-gray-100 hover:border-gray-200 transition-colors"
                  >
                    {showPast ? "Show less" : `Show all ${past.length} past bookings`}
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <CancelBookingModal
        open={!!cancelTarget}
        booking={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={(id, issued, currency) => {
          handleCancelled(id, issued, currency);
        }}
      />
    </div>
  );
}

function AccountBookingCard({
  booking,
  variant,
  onCancel,
  isReviewed,
  onReviewed,
  authedFetch,
}: {
  booking: Booking;
  variant: "upcoming" | "past";
  onCancel?: () => void;
  isReviewed?: boolean;
  onReviewed?: () => void;
  authedFetch?: ReturnType<typeof useAuthedFetch>;
}) {
  const startHour = booking.hours[0];
  const endHour = booking.hours[booking.hours.length - 1] + 1;
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleReviewSubmit() {
    if (!authedFetch || rating === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await authedFetch("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          businessSlug: booking.businessSlug,
          bookingId: booking.id,
          rating,
          comment,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError((data as { error?: string }).error ?? "Something went wrong");
        return;
      }
      onReviewed?.();
      setReviewOpen(false);
    } catch {
      setSubmitError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 overflow-hidden ${variant === "past" ? "opacity-80" : ""}`}>
      <div
        className="h-1"
        style={{ backgroundColor: variant === "upcoming" ? "#22c55e" : "#d1d5db" }}
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div>
              <p className="text-sm font-bold text-gray-900 truncate">{booking.facilityName}</p>
              <Link
                href={`/${booking.businessSlug}`}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {booking.businessName} →
              </Link>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <CalendarDays size={11} className="text-gray-400" />
                {formatDate(booking.date)}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={11} className="text-gray-400" />
                {formatHour(startHour)}–{formatHour(endHour)}
              </span>
            </div>
            {booking.creditApplied && booking.creditApplied > 0 && (
              <p className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                <Coins size={11} />
                ₱{booking.creditApplied.toLocaleString()} credits applied
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-black text-gray-900">
              ₱{booking.totalPrice.toLocaleString()}
            </p>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={
                variant === "upcoming"
                  ? { backgroundColor: "#dcfce7", color: "#16a34a" }
                  : { backgroundColor: "#f3f4f6", color: "#6b7280" }
              }
            >
              {variant === "upcoming" ? "Confirmed" : "Completed"}
            </span>
          </div>
        </div>

        {variant === "upcoming" && onCancel && (
          <button
            onClick={onCancel}
            className="mt-3 text-xs font-semibold text-red-400 hover:text-red-600 transition-colors"
          >
            Cancel booking
          </button>
        )}

        {variant === "past" && (
          <div className="mt-3">
            {isReviewed ? (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Star size={11} className="text-amber-400 fill-amber-400" />
                Review submitted
              </p>
            ) : !reviewOpen ? (
              <button
                data-testid="leave-review-btn"
                onClick={() => setReviewOpen(true)}
                className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors"
              >
                Leave a review →
              </button>
            ) : (
              <div className="space-y-2 pt-1 border-t border-gray-100 mt-2" data-testid="review-form">
                {/* Star picker */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseEnter={() => setHovered(s)}
                      onMouseLeave={() => setHovered(0)}
                      onClick={() => setRating(s)}
                      className="p-0.5"
                    >
                      <Star
                        size={20}
                        className={
                          s <= (hovered || rating)
                            ? "text-amber-400 fill-amber-400"
                            : "text-gray-200 fill-gray-200"
                        }
                      />
                    </button>
                  ))}
                  {rating > 0 && (
                    <span className="text-xs text-gray-400 ml-1">
                      {["", "Poor", "Fair", "Good", "Very good", "Excellent"][rating]}
                    </span>
                  )}
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={500}
                  placeholder="Share your experience (optional)…"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-900 outline-none focus:border-gray-400 transition-colors resize-none"
                />
                {submitError && (
                  <p className="text-xs text-red-500">{submitError}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleReviewSubmit()}
                    disabled={submitting || rating === 0}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? "Submitting…" : "Submit"}
                  </button>
                  <button
                    onClick={() => { setReviewOpen(false); setRating(0); setComment(""); setSubmitError(null); }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
