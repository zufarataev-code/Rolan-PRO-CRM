import { NextRequest } from "next/server";

import { runGoogleAdsSyncCycle } from "@/features/google-ads/sync-cycle";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Owner: run one delivery pass now instead of waiting for the 10-minute cycle. */
export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Google Ads sync is owner-only.");
  try {
    return apiSuccess(await runGoogleAdsSyncCycle());
  } catch (error) {
    return apiError(502, "google_ads_sync_failed", error instanceof Error ? error.message : "Google Ads sync failed.");
  }
}
