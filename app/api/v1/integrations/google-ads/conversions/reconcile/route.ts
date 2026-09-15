import { NextRequest } from "next/server";

import { reconcileConvertedLeadOutbox } from "@/features/google-ads/reconciliation";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Google Ads reconciliation is owner-only.",
    );
  }

  const body = (await request.json().catch(() => null)) as { limit?: number } | null;
  const limit = typeof body?.limit === "number" && Number.isFinite(body.limit) ? body.limit : undefined;
  const result = await reconcileConvertedLeadOutbox(limit);

  return apiSuccess(result);
}
