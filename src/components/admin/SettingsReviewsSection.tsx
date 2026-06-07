"use client";

import { useEffect, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { getReviewsForBusiness } from "@/lib/firebase/reviews";
import type { Review } from "@/lib/types";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { SectionHeader } from "./SettingsShared";

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={11}
          className={s <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}
        />
      ))}
    </span>
  );
}

export default function SettingsReviewsSection({
  businessSlug,
  open,
  onToggle,
}: {
  businessSlug: string;
  open: boolean;
  onToggle: () => void;
}) {
  const authedFetch = useAuthedFetch();
  // null = not yet loaded, [] = loaded but empty
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getReviewsForBusiness(businessSlug, 50)
      .then((r) => { if (!cancelled) setReviews(r); })
      .catch(() => { if (!cancelled) setReviews([]); });
    return () => { cancelled = true; };
  }, [open, businessSlug]);

  async function handleDelete(reviewId: string) {
    setDeletingId(reviewId);
    try {
      const res = await authedFetch(
        `/api/reviews/${reviewId}?slug=${encodeURIComponent(businessSlug)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setReviews((prev) => (prev ?? []).filter((r) => r.id !== reviewId));
      }
    } catch {
      // no-op — user can retry
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
      <SectionHeader title="Reviews" open={open} onToggle={onToggle} />
      {open && (
        <div>
          {reviews === null && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-gray-300 animate-spin" />
            </div>
          )}
          {reviews !== null && reviews.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">No reviews yet.</p>
          )}
          {reviews !== null && reviews.length > 0 && (
            <div className="divide-y divide-gray-100">
              {reviews.map((r) => (
                <div key={r.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-800">{r.userName}</span>
                      <StarRow rating={r.rating} />
                      <span className="text-[10px] text-gray-400">
                        {r.createdAt?.toDate?.().toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }) ?? ""}
                      </span>
                    </div>
                    {r.comment && (
                      <p className="text-xs text-gray-500 leading-relaxed">{r.comment}</p>
                    )}
                  </div>
                  <button
                    data-testid={`delete-review-${r.id}`}
                    onClick={() => void handleDelete(r.id)}
                    disabled={deletingId === r.id}
                    className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Delete review"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
