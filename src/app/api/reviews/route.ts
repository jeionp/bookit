import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { requireString } from "@/lib/api/validation";
import { adminDb } from "@/lib/firebase/admin-app";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const { uid, name, email } = tokenOrRes;

  const body = await req.json();
  const businessSlug = requireString(body.businessSlug);
  const bookingId    = requireString(body.bookingId);
  const comment      = requireString(body.comment);
  const rating       = Number(body.rating);

  if (!businessSlug || !bookingId || !comment) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
  }
  if (comment.length > 500) {
    return NextResponse.json({ error: "Comment must be 500 characters or fewer" }, { status: 400 });
  }

  // Verify the booking belongs to this user, is confirmed, and is in the past
  const bookingSnap = await adminDb.collection("bookings").doc(bookingId).get();
  if (!bookingSnap.exists) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  const booking = bookingSnap.data()!;
  if (booking.userId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (booking.businessSlug !== businessSlug) {
    return NextResponse.json({ error: "Booking does not belong to this business" }, { status: 400 });
  }
  if (booking.status !== "confirmed") {
    return NextResponse.json({ error: "Only confirmed bookings can be reviewed" }, { status: 400 });
  }

  // Check the booking date is in the past
  const [y, m, d] = (booking.date as string).split("-").map(Number);
  const lastHour: number = Math.max(...(booking.hours as number[]));
  const bookingEnd = new Date(y, m - 1, d, lastHour + 1);
  if (bookingEnd > new Date()) {
    return NextResponse.json({ error: "Booking has not yet completed" }, { status: 400 });
  }

  const reviewRef  = adminDb.doc(`businesses/${businessSlug}/reviews/${bookingId}`);
  const businessRef = adminDb.collection("businesses").doc(businessSlug);

  try {
    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(reviewRef);
      if (existing.exists) {
        throw Object.assign(new Error("already_reviewed"), { alreadyReviewed: true });
      }

      const allReviewsSnap = await tx.get(
        adminDb.collection(`businesses/${businessSlug}/reviews`),
      );
      const currentCount  = allReviewsSnap.size;
      const currentRating = (await tx.get(businessRef)).data()?.rating ?? 0;
      const newCount  = currentCount + 1;
      const newRating = parseFloat(
        ((currentRating * currentCount + rating) / newCount).toFixed(1),
      );

      tx.set(reviewRef, {
        userId:       uid,
        userName:     name ?? email ?? "Anonymous",
        businessSlug,
        bookingId,
        rating,
        comment:      comment.trim(),
        createdAt:    FieldValue.serverTimestamp(),
      });
      tx.update(businessRef, {
        rating:      newRating,
        reviewCount: FieldValue.increment(1),
      });
    });
  } catch (err) {
    if ((err as { alreadyReviewed?: boolean }).alreadyReviewed) {
      return NextResponse.json({ error: "You have already reviewed this booking" }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
