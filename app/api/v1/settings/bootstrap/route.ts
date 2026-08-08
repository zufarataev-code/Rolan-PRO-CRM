import { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getSettingsBootstrap } from "@/lib/reference/bootstrap";
import type { ReferenceLocale } from "@/lib/reference/locale";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);

  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      auth.reason === "forbidden" ? "Insufficient role permissions." : "Authentication is required.",
    );
  }

  const locale = (request.nextUrl.searchParams.get("locale") ?? "ru") as ReferenceLocale;
  const safeLocale: ReferenceLocale = locale === "en" ? "en" : "ru";
  const data = await getSettingsBootstrap(safeLocale);

  return apiSuccess(data, {
    locale: safeLocale,
  });
}
