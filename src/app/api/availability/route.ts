// Server-side availability endpoint using the Admin SDK.
// Exists to avoid PII exposure: a public Firestore query returns full booking
// documents (userId, userEmail, userName). This route returns only { bookedHours }
// and never touches the client SDK, so no booking PII reaches the browser.
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { adminDb } from "@/lib/firebase/admin-app";
import { isYmdDate } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

let ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit | null {
  if (process.env.FIRESTORE_EMULATOR_HOST) return null;
  if (ratelimit) return ratelimit;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  ratelimit = new Ratelimit({
    redis:   Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(60, "60 s"),
    prefix:  "serbi:rl:availability",
  });
  return ratelimit;
}

// ─── Emulator fast-path ───────────────────────────────────────────────────────
// In emulator mode the Admin SDK's gRPC connection degrades after many sequential
// test runs and silently returns empty results. Querying the emulator's REST API
// directly (stateless HTTP) avoids this entirely. Bearer "owner" is the emulator's
// admin bypass token — Firestore security rules are not applied.
type FirestoreField = { integerValue?: string; arrayValue?: { values?: { integerValue?: string }[] } };
type FirestoreRunQueryResult = { document?: { name: string; fields: Record<string, FirestoreField> } };

async function queryEmulatorBookings(
  status: string,
  businessSlug: string,
  facilityId: string,
  date: string,
  excludeBookingId: string | null,
): Promise<number[]> {
  const host = `http://${process.env.FIRESTORE_EMULATOR_HOST}`;
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const url = `${host}/v1/projects/${project}/databases/(default)/documents:runQuery`;

  const body = {
    structuredQuery: {
      from: [{ collectionId: "bookings" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "businessSlug" }, op: "EQUAL", value: { stringValue: businessSlug } } },
            { fieldFilter: { field: { fieldPath: "facilityId" }, op: "EQUAL", value: { stringValue: facilityId } } },
            { fieldFilter: { field: { fieldPath: "date" }, op: "EQUAL", value: { stringValue: date } } },
            { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: status } } },
          ],
        },
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer owner" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];

  const results = (await res.json()) as FirestoreRunQueryResult[];
  const hours: number[] = [];
  for (const result of results) {
    if (!result.document) continue;
    const docId = result.document.name.split("/").pop()!;
    if (excludeBookingId && docId === excludeBookingId) continue;
    const field = result.document.fields.hours;
    for (const v of field?.arrayValue?.values ?? []) {
      if (v.integerValue !== undefined) hours.push(parseInt(v.integerValue, 10));
    }
  }
  return hours;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rl = getRatelimit();
  if (rl) {
    const ip = req.headers.get("x-real-ip") ?? "anonymous";
    try {
      const { success } = await rl.limit(ip);
      if (!success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    } catch (err) {
      // Redis unavailable — fail open; blocking availability reads hurts UX more than the cost risk.
      console.error("[api/availability] rate-limit error:", err);
    }
  }

  const { searchParams } = req.nextUrl;
  const businessSlug = searchParams.get("businessSlug");
  const facilityId = searchParams.get("facilityId");
  const date = searchParams.get("date");
  const excludeBookingId = searchParams.get("excludeBookingId") ?? null;

  if (!businessSlug || !facilityId || !date) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }
  if (businessSlug.length > 64 || facilityId.length > 64) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  if (!isYmdDate(date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const [bookedHours, pendingHours] = await Promise.all([
      queryEmulatorBookings("confirmed", businessSlug, facilityId, date, excludeBookingId),
      queryEmulatorBookings("slot_held", businessSlug, facilityId, date, excludeBookingId),
    ]);
    return NextResponse.json({ bookedHours, pendingHours });
  }

  const [confirmedSnap, pendingSnap] = await Promise.all([
    adminDb
      .collection("bookings")
      .where("businessSlug", "==", businessSlug)
      .where("facilityId", "==", facilityId)
      .where("date", "==", date)
      .where("status", "==", "confirmed")
      .get(),
    adminDb
      .collection("bookings")
      .where("businessSlug", "==", businessSlug)
      .where("facilityId", "==", facilityId)
      .where("date", "==", date)
      .where("status", "==", "slot_held")
      .get(),
  ]);

  const bookedHours: number[] = [];
  confirmedSnap.docs.forEach((doc) => {
    if (excludeBookingId && doc.id === excludeBookingId) return;
    (doc.data().hours as number[]).forEach((h) => bookedHours.push(h));
  });

  const pendingHours: number[] = [];
  pendingSnap.docs.forEach((doc) => {
    if (excludeBookingId && doc.id === excludeBookingId) return;
    (doc.data().hours as number[]).forEach((h) => pendingHours.push(h));
  });

  return NextResponse.json({ bookedHours, pendingHours });
}
