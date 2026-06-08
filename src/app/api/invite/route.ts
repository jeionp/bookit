import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Timestamp } from "firebase-admin/firestore";
import { requireUser, isAdminOf } from "@/lib/api/auth";
import { requireString } from "@/lib/api/validation";
import { adminDb, adminAuth } from "@/lib/firebase/admin-app";
import { COLL } from "@/lib/api/constants";
import { sendAdminInvite } from "@/lib/notifications/email";

export interface InviteRequest {
  email:        string;
  name?:        string;
  businessSlug: string;
  businessName: string;
}

let ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  ratelimit = new Ratelimit({
    redis:   Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(20, "60 m"),
    prefix:  "serbi:rl:invite",
  });
  return ratelimit;
}

export async function POST(req: NextRequest) {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const uid = tokenOrRes.uid;

  const body = (await req.json()) as InviteRequest;
  const email        = requireString(body.email);
  const businessSlug = requireString(body.businessSlug);
  const businessName = requireString(body.businessName);
  if (!email || !businessSlug || !businessName) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!(await isAdminOf(uid, businessSlug))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = getRatelimit();
  if (rl) {
    try {
      const { success } = await rl.limit(`invite:${uid}:${businessSlug}`);
      if (!success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    } catch (err) {
      console.error("[api/invite] rate-limit error:", err);
    }
  }

  let inviterName = "An admin";
  try {
    const inviterRecord = await adminAuth.getUser(uid);
    inviterName = inviterRecord.displayName ?? inviterRecord.email ?? "An admin";
  } catch {
    // non-blocking — fall back to generic
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000));

  await adminDb.collection(COLL.INVITES).doc(token).set({
    token,
    email,
    businessSlug,
    businessName,
    invitedBy:  uid,
    inviterName,
    expiresAt,
    createdAt:  Timestamp.now(),
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const acceptUrl = `${baseUrl}/accept-invite?token=${token}`;

  await sendAdminInvite({ inviteeEmail: email, businessName, businessSlug, inviterName, acceptUrl });

  return NextResponse.json({ ok: true });
}
