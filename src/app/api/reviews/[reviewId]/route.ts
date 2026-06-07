import { NextRequest, NextResponse } from "next/server";
import { requireAdminOf } from "@/lib/api/auth";
import { adminDb } from "@/lib/firebase/admin-app";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await params;

  // businessSlug must be passed as a query param so we can auth-check the admin
  const { searchParams } = new URL(req.url);
  const businessSlug = searchParams.get("slug") ?? "";
  if (!businessSlug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const uidOrRes = await requireAdminOf(req, businessSlug);
  if (uidOrRes instanceof NextResponse) return uidOrRes;

  const reviewRef   = adminDb.doc(`businesses/${businessSlug}/reviews/${reviewId}`);
  const businessRef = adminDb.collection("businesses").doc(businessSlug);

  await adminDb.runTransaction(async (tx) => {
    const reviewSnap = await tx.get(reviewRef);
    if (!reviewSnap.exists) return; // already gone — idempotent

    const deletedRating: number = reviewSnap.data()!.rating;

    const allReviewsSnap = await tx.get(
      adminDb.collection(`businesses/${businessSlug}/reviews`),
    );
    const currentCount  = allReviewsSnap.size;
    const currentRating = (await tx.get(businessRef)).data()?.rating ?? 0;
    const newCount = Math.max(0, currentCount - 1);
    const newRating =
      newCount === 0
        ? 0
        : parseFloat(
            ((currentRating * currentCount - deletedRating) / newCount).toFixed(1),
          );

    tx.delete(reviewRef);
    tx.update(businessRef, {
      rating:      newRating,
      reviewCount: FieldValue.increment(-1),
    });
  });

  return NextResponse.json({ ok: true });
}
