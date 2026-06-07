import { NextRequest, NextResponse } from "next/server";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { requireUser } from "@/lib/api/auth";
import { adminDb } from "@/lib/firebase/admin-app";
import { COLL } from "@/lib/api/constants";

interface InviteDoc {
  token:        string;
  email:        string;
  businessSlug: string;
  businessName: string;
  invitedBy:    string;
  inviterName:  string;
  expiresAt:    Timestamp;
  createdAt:    Timestamp;
  redeemedAt?:  Timestamp;
  redeemedBy?:  string;
}

export async function POST(req: NextRequest) {
  const tokenOrRes = await requireUser(req);
  if (tokenOrRes instanceof NextResponse) return tokenOrRes;
  const uid = tokenOrRes.uid;

  const body = (await req.json()) as { token?: string };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const inviteRef = adminDb.collection(COLL.INVITES).doc(token);
  const inviteSnap = await inviteRef.get();

  if (!inviteSnap.exists) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  const invite = inviteSnap.data() as InviteDoc;

  if (invite.redeemedAt) {
    return NextResponse.json({ error: "Invite already used" }, { status: 409 });
  }

  const now = Timestamp.now();
  if (invite.expiresAt.toMillis() < now.toMillis()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  const { businessSlug } = invite;

  await adminDb.runTransaction(async (tx) => {
    const adminRef = adminDb.collection(COLL.ADMINS).doc(uid);
    const adminSnap = await tx.get(adminRef);

    if (adminSnap.exists) {
      tx.update(adminRef, { slugs: FieldValue.arrayUnion(businessSlug) });
    } else {
      tx.set(adminRef, { slugs: [businessSlug] });
    }

    tx.update(inviteRef, { redeemedAt: now, redeemedBy: uid });
  });

  return NextResponse.json({ ok: true, businessSlug });
}
