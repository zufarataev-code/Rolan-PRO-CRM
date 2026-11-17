import { authorizeGoogleAdsSync } from "@/features/google-ads/sync-auth";
import { runMetaCapiSyncCycle } from "@/features/meta-capi/processor";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  if (request.headers.has("authorization")) {
    const auth = authorizeGoogleAdsSync(request.headers.get("authorization"), process.env.GOOGLE_ADS_SYNC_SECRET);
    if (auth !== "authorized") return apiError(auth === "not_configured" ? 503 : 401, auth, "Scheduled conversion processing authorization failed.");
  } else {
    const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
    if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Meta CAPI processing is owner-only.");
  }
  const body = await request.json().catch(() => null) as { limit?: number } | null;
  const limit = typeof body?.limit === "number" && Number.isFinite(body.limit) ? Math.trunc(body.limit) : 10;
  return apiSuccess(await runMetaCapiSyncCycle({ limit }));
}
