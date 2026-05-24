import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";
import { requireUser, isAdminOf } from "@/lib/api/auth";
import { isYmdDate } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const uid = tokenOrRes.uid;

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to");     // YYYY-MM-DD

  if (!slug || !from || !to) {
    return NextResponse.json({ error: "slug, from, and to are required" }, { status: 400 });
  }

  if (!isYmdDate(from) || !isYmdDate(to)) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from must not be after to" }, { status: 400 });
  }

  if (!(await isAdminOf(uid, slug))) {
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
