import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set([
  "pending_proof",
  "ai_review",
  "paid",
  "rejected",
  "pending_cash",
  "pending_gateway",
]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const status = searchParams.get("status") ?? null;
  const limitParam = parseInt(searchParams.get("limit") ?? "100", 10);
  const limit = isNaN(limitParam) || limitParam < 1 || limitParam > 200 ? 100 : limitParam;

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  if (status !== null && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
  }

  const adminDoc = await adminDb.collection("admins").doc(uid).get();
  const slugs: string[] = adminDoc.exists ? (adminDoc.data()?.slugs ?? []) : [];
  if (!slugs.includes(slug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snap = await adminDb
    .collection("bookings")
    .where("businessSlug", "==", slug)
    .get();

  let docs = snap.docs.map((d) => {
    const b = d.data();
    return {
      id: d.id,
      userName: (b.userName as string) ?? "",
      userEmail: (b.userEmail as string) ?? "",
      facilityName: (b.facilityName as string) ?? "",
      date: (b.date as string) ?? "",
      hours: (b.hours as number[]) ?? [],
      totalPrice: (b.totalPrice as number) ?? 0,
      currency: (b.currency as string) ?? "PHP",
      status: (b.status as string) ?? "",
      checkout_type: (b.checkout_type as string) ?? null,
      payment_status_v2: (b.payment_status_v2 as string) ?? null,
      held_until: b.held_until?.toDate?.()?.toISOString() ?? null,
      createdAt: b.createdAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  if (status !== null) {
    docs = docs.filter((b) => b.payment_status_v2 === status);
  }

  // Sort by createdAt descending; null createdAt goes last
  docs.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return NextResponse.json({ bookings: docs.slice(0, limit) });
}
