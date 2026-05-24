import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { requireUser, isAdminOf } from "@/lib/api/auth";
import { requireString } from "@/lib/api/validation";

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

  console.log("[api/invite] stub called:", body);
  return NextResponse.json({ ok: true, stub: true });
}
