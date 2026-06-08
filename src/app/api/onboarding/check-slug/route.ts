import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { adminDb } from "@/lib/firebase/admin-app";
import { isValidSlug } from "@/lib/slugify";

export const dynamic = "force-dynamic";

let ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  ratelimit = new Ratelimit({
    redis:   Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(30, "60 s"),
    prefix:  "serbi:rl:check-slug",
  });
  return ratelimit;
}

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
      console.error("[api/onboarding/check-slug] rate-limit error:", err);
    }
  }

  const slug = req.nextUrl.searchParams.get("slug") ?? "";

  if (!isValidSlug(slug)) {
    return NextResponse.json({ available: false, error: "Invalid slug format" }, { status: 400 });
  }

  const doc = await adminDb.collection("businesses").doc(slug).get();
  return NextResponse.json({ available: !doc.exists });
}
