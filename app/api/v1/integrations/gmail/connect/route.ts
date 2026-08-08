import { NextRequest, NextResponse } from "next/server";

import { createGmailOAuthState } from "@/features/gmail/crypto";
import { gmailAuthorizationUrl } from "@/features/gmail/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return NextResponse.redirect(new URL("/login?error=gmail_access_denied", request.url));
  const state = createGmailOAuthState(auth.session.user.user_id);
  return NextResponse.redirect(gmailAuthorizationUrl(state));
}
