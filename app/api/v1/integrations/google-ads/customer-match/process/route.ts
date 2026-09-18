import { NextRequest } from "next/server";

import { processNextCustomerMatchUpload } from "@/features/google-ads/customer-match-uploader";
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
      "Google Ads Customer Match processing is owner-only.",
    );
  }

  const body = (await request.json().catch(() => null)) as { limit?: number } | null;
  const requested = Number.isFinite(body?.limit) ? Math.trunc(body?.limit ?? 1) : 1;
  const limit = Math.max(1, Math.min(MAX_BATCH, requested));
  const results: Array<Awaited<ReturnType<typeof processNextCustomerMatchUpload>>> = [];

  for (let index = 0; index < limit; index += 1) {
    const result = await processNextCustomerMatchUpload();
    results.push(result);
    if (result.status === "idle" || result.status === "disabled") break;
  }

  return apiSuccess({
    requested: limit,
    processed: results.filter((result) => result.status !== "idle" && result.status !== "disabled").length,
    validated: results.filter((result) => result.status === "validated").length,
    submitted: results.filter((result) => result.status === "submitted").length,
    suppressed: results.filter((result) => result.status === "suppressed").length,
    retry: results.filter((result) => result.status === "retry").length,
    needs_operator_action: results.filter((result) => result.status === "needs_operator_action").length,
    results,
  });
}
