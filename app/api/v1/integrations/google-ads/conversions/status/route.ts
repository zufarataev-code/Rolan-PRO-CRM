import { NextRequest } from "next/server";

import { reconcileNextConversionRequestStatus } from "@/features/google-ads/request-status";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const MAX_BATCH = 25;

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Google Ads request-status reconciliation is owner-only.",
    );
  }

  const body = (await request.json().catch(() => null)) as { limit?: number } | null;
  const requested = Number.isFinite(body?.limit) ? Math.trunc(body?.limit ?? 1) : 1;
  const limit = Math.max(1, Math.min(MAX_BATCH, requested));
  const results: Array<Awaited<ReturnType<typeof reconcileNextConversionRequestStatus>>> = [];

  for (let index = 0; index < limit; index += 1) {
    const result = await reconcileNextConversionRequestStatus();
    results.push(result);
    if (result.status === "idle" || result.status === "processing" || result.status === "retry") break;
  }

  return apiSuccess({ requested: limit, results });
}
