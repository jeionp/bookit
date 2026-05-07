import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin-app";
import { isValidSlug } from "@/lib/slugify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";

  if (!isValidSlug(slug)) {
    return NextResponse.json({ available: false, error: "Invalid slug format" }, { status: 400 });
  }

  const doc = await adminDb.collection("businesses").doc(slug).get();
  return NextResponse.json({ available: !doc.exists });
}
