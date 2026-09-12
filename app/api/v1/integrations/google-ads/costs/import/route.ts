import { NextRequest } from "next/server";

import { GoogleAdsCostFeedError, importGoogleAdsDailyCosts } from "@/features/google-ads/cost-feed";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type CostImportBody = {
  start_date?: unknown;
  end_date?: unknown;
};

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Google Ads cost import is owner-only.",
    );
  }

  const body = (await request.json().catch(() => null)) as CostImportBody | null;
  if (!body || typeof body !== "object") {
    return apiError(400, "invalid_body", "A JSON request body is required.");
  }
  if (typeof body.start_date !== "string" || typeof body.end_date !== "string") {
    return apiError(400, "date_range_required", "start_date and end_date are required in YYYY-MM-DD format.");
  }

  try {
    const result = await importGoogleAdsDailyCosts(body.start_date, body.end_date);
    return apiSuccess({
      customer_id: result.customerId,
      start_date: result.startDate,
      end_date: result.endDate,
      imported_rows: result.importedRows,
      total_cost_micros: result.totalCostMicros,
      total_cost_amount: result.totalCostAmount,
      total_clicks: result.totalClicks,
      total_impressions: result.totalImpressions,
      currencies: result.currencies,
    });
  } catch (cause) {
    if (cause instanceof GoogleAdsCostFeedError) {
      const status = cause.code.startsWith("google_ads_http_") ? 502 : 400;
      return apiError(status, cause.code, cause.message);
    }
    throw cause;
  }
}
