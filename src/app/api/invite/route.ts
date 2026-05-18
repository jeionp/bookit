import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";

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
    prefix:  "bookit:rl:invite",
  });
  return ratelimit;
}

// TODO: replace stub with real email send (e.g. Resend, SendGrid, or Firebase Extensions).
// The invite should link to /[businessSlug] with a "sign up" prompt pre-filled with the email.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as InviteRequest;
  const { email, businessSlug, businessName } = body;

  if (!email || typeof email !== "string" || !businessSlug || !businessName) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const adminDoc = await adminDb.collection("admins").doc(uid).get();
  const slugs: string[] = adminDoc.exists ? (adminDoc.data()?.slugs ?? []) : [];
  if (!slugs.includes(businessSlug)) {
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

  console.log("[api/invite] stub called:", body);
  return NextResponse.json({ ok: true, stub: true });
}
