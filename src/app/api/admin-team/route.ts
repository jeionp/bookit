import { NextRequest, NextResponse } from "next/server";
import { requireAdminOf } from "@/lib/api/auth";
import { adminDb, adminAuth } from "@/lib/firebase/admin-app";
import { COLL } from "@/lib/api/constants";

export interface TeamMember {
  uid:         string;
  email:       string;
  displayName: string;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const uidOrRes = await requireAdminOf(req, slug);
  if (uidOrRes instanceof NextResponse) return uidOrRes;

  // Query admins collection for all docs whose slugs array contains this business slug
  const snapshot = await adminDb
    .collection(COLL.ADMINS)
    .where("slugs", "array-contains", slug)
    .get();

  const members: TeamMember[] = [];
  await Promise.all(
    snapshot.docs.map(async (doc) => {
      const uid = doc.id;
      try {
        const user = await adminAuth.getUser(uid);
        members.push({
          uid,
          email:       user.email ?? "",
          displayName: user.displayName ?? user.email ?? uid,
        });
      } catch {
        // User deleted from Auth — skip
      }
    }),
  );

  // Stable order: sort by displayName
  members.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ members });
}
