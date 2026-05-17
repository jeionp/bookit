import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";

export const dynamic = "force-dynamic";

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
  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to");     // YYYY-MM-DD

  if (!slug || !from || !to) {
    return NextResponse.json({ error: "slug, from, and to are required" }, { status: 400 });
  }

  // Validate date format
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from must not be after to" }, { status: 400 });
  }

  const adminDoc = await adminDb.collection("admins").doc(uid).get();
  const slugs: string[] = adminDoc.exists ? (adminDoc.data()?.slugs ?? []) : [];
  if (!slugs.includes(slug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snap = await adminDb
    .collection("bookings")
    .where("businessSlug", "==", slug)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .get();

  type Summary = { count: number; revenue: number };
  const totals: Record<string, Summary> = {
    P2P_AI: { count: 0, revenue: 0 },
    PAY_AT_VENUE: { count: 0, revenue: 0 },
    GATEWAY_SPLIT: { count: 0, revenue: 0 },
    instant: { count: 0, revenue: 0 },
  };
  let currency = "PHP";
  let grandCount = 0;
  let grandRevenue = 0;

  for (const doc of snap.docs) {
    const b = doc.data();
    const checkoutType = (b.checkout_type as string | undefined) ?? "instant";
    const status = b.status as string;
    const paymentStatusV2 = b.payment_status_v2 as string | undefined;
    const totalPrice = (b.totalPrice as number) ?? 0;
    if (b.currency) currency = b.currency as string;

    const isPaid =
      (checkoutType === "instant" && status === "confirmed") ||
      (checkoutType !== "instant" && paymentStatusV2 === "paid");

    if (!isPaid) continue;

    const key = checkoutType in totals ? checkoutType : "instant";
    totals[key].count++;
    totals[key].revenue += totalPrice;
    grandCount++;
    grandRevenue += totalPrice;
  }

  return NextResponse.json({
    totals,
    grand: { count: grandCount, revenue: grandRevenue },
    currency,
  });
}
