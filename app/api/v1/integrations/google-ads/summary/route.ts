import { NextRequest } from "next/server";

import { googleAdsSpendSummary } from "@/features/google-ads/script-costs";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Google Ads spend per campaign for the CRM analytics block (owner). */
export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Google Ads spend is for the owner.");
  const days = Number(request.nextUrl.searchParams.get("days") ?? 30);
  return apiSuccess(await googleAdsSpendSummary(days));
}
