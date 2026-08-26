import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth/server";
import { ROLE_CODES } from "@/lib/auth/constants";
import { getEnv } from "@/lib/env";
import { replaceLegacyBootstrapLogin } from "@/features/legacy-crm/html-shell";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const publicAppUrl = getEnv().appUrl;

  if (!session) {
    return NextResponse.redirect(new URL("/login", publicAppUrl));
  }

  if (!session.roles.includes(ROLE_CODES.OWNER) && !session.roles.includes(ROLE_CODES.MANAGER)) {
    return NextResponse.redirect(new URL("/", publicAppUrl));
  }

  if (session.user.must_change_password) {
    return NextResponse.redirect(new URL("/change-password", publicAppUrl));
  }

  const html = await readFile(
    path.join(process.cwd(), "private", "legacy", "rolanpro-crm-cloud.html"),
    "utf8",
  );

  const cloudHtml = replaceLegacyBootstrapLogin(html);
  const mailShortcut = `
    <style>
      #rolanpro-mail-shortcut{position:fixed;right:22px;top:78px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:#fff;color:#1d4ed8;border:1px solid #bfdbfe;box-shadow:0 10px 30px rgba(15,23,42,.16);font:800 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-decoration:none}
      #rolanpro-mail-shortcut:hover{background:#eff6ff;transform:translateY(-1px)}
      #rolanpro-mail-shortcut .mail-icon{color:#ea4335;font-size:16px;line-height:1}
      @media(max-width:760px){#rolanpro-mail-shortcut{right:12px;top:70px;padding:9px 12px}}
    </style>
    <a id="rolanpro-mail-shortcut" href="/mail" aria-label="Открыть рабочую почту"><span class="mail-icon"><i class="bi bi-envelope-fill" aria-hidden="true"></i></span>Почта</a>
  `;
  const closingBodyIndex = cloudHtml.toLowerCase().lastIndexOf("</body>");
  const htmlWithMail = closingBodyIndex >= 0
    ? `${cloudHtml.slice(0, closingBodyIndex)}${mailShortcut}${cloudHtml.slice(closingBodyIndex)}`
    : `${cloudHtml}${mailShortcut}`;

  return new NextResponse(htmlWithMail, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "same-origin",
    },
  });
}
