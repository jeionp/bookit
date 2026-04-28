import { NextRequest, NextResponse } from "next/server";

export interface InviteRequest {
  email:        string;
  name?:        string;
  businessSlug: string;
  businessName: string;
}

// TODO: replace stub with real email send (e.g. Resend, SendGrid, or Firebase Extensions).
// The invite should link to /[businessSlug] with a "sign up" prompt pre-filled with the email.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as InviteRequest;
  console.log("[api/invite] stub called:", body);
  return NextResponse.json({ ok: true, stub: true });
}
