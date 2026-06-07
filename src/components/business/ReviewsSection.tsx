"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { getReviewsForBusiness } from "@/lib/firebase/reviews";
import type { Review } from "@/lib/types";

function StarRow({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          className={s <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}
        />
      ))}
    </span>
  );
}

function timeAgo(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts?.toDate) return "";
  const diff = Date.now() - ts.toDate().getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
}

export default function ReviewsSection({
  businessSlug,
  accentColor,
}: {
  businessSlug: string;
  accentColor: string;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReviewsForBusiness(businessSlug, 5)
      .then(setReviews)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessSlug]);

  if (loading) return null;
  if (reviews.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">Reviews</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {reviews.map((r) => (
          <div key={r.id} className="px-5 py-3.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0"
                  style={{ backgroundColor: accentColor }}
                >
                  {(r.userName ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="text-xs font-semibold text-gray-800 truncate max-w-[110px]">
                  {r.userName}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StarRow rating={r.rating} />
                <span className="text-[10px] text-gray-400">{timeAgo(r.createdAt as Parameters<typeof timeAgo>[0])}</span>
              </div>
            </div>
            {r.comment && (
              <p className="text-[11px] text-gray-500 leading-relaxed pl-8">{r.comment}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
