import { NextRequest } from "next/server";

import { GoogleAdsRoasError, getGoogleAdsRoasReport } from "@/features/google-ads/roas";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Google Ads ROAS reporting is owner-only.",
    );
  }

  const startDate = request.nextUrl.searchParams.get("start_date");
  const endDate = request.nextUrl.searchParams.get("end_date");
  if (!startDate || !endDate) {
    return apiError(400, "date_range_required", "start_date and end_date are required in YYYY-MM-DD format.");
  }

  try {
    const report = await getGoogleAdsRoasReport(startDate, endDate);
    return apiSuccess({
      start_date: report.startDate,
      end_date: report.endDate,
      google_ads_customer_ids: report.customerIds,
      attributed_conversions: report.attributedConversions,
      clicks: report.clicks,
      impressions: report.impressions,
      by_currency: report.byCurrency,
    });
  } catch (cause) {
    if (cause instanceof GoogleAdsRoasError) {
      return apiError(400, cause.code, cause.message);
    }
    throw cause;
  }
}
