import { NextRequest } from "next/server";
import { getGoogleAdsCampaignReport } from "@/features/google-ads/campaign-report";
import { GoogleAdsRoasError } from "@/features/google-ads/roas";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Google Ads profitability is owner-only.");
  const params = request.nextUrl.searchParams;
  try { return apiSuccess(await getGoogleAdsCampaignReport(params.get("start_date"), params.get("end_date"), params.get("customer_id"))); }
  catch (error) {
    if (error instanceof GoogleAdsRoasError) return apiError(400, error.code, error.message);
    throw error;
  }
}
