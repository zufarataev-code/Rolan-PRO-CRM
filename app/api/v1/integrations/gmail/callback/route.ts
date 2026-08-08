import { NextRequest, NextResponse } from "next/server";

import { verifyGmailOAuthState } from "@/features/gmail/crypto";
import { connectGmailAccount, syncPrimaryGmail } from "@/features/gmail/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";

function popupResult(ok: boolean, message: string) {
  const safeMessage = JSON.stringify(message).replace(/</g, "\\u003c");
  const safeStatus = ok ? "gmail-connected" : "gmail-error";
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><title>Gmail · ROLANPRO</title></head><body style="font-family:system-ui;padding:32px;color:#0f172a"><h2>${ok ? "Gmail подключён" : "Не удалось подключить Gmail"}</h2><p>${message.replace(/[<>&]/g, "")}</p><script>if(window.opener){window.opener.postMessage({type:${JSON.stringify(safeStatus)},message:${safeMessage}},window.location.origin);setTimeout(()=>window.close(),700)}</script></body></html>`, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return popupResult(false, "Сессия владельца CRM не найдена.");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) return popupResult(false, `Google OAuth: ${oauthError}`);
  if (!code || !state || !verifyGmailOAuthState(state, auth.session.user.user_id)) {
    return popupResult(false, "Недействительный или просроченный OAuth-запрос.");
  }
  try {
    const connection = await connectGmailAccount(code, auth.session.user.user_id);
    await syncPrimaryGmail();
    return popupResult(true, `${connection.email_address} подключён к CRM.`);
  } catch (error) {
    return popupResult(false, error instanceof Error ? error.message : "Ошибка подключения Gmail.");
  }
}
