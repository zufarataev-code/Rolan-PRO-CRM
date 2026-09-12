import { NextRequest } from "next/server";

import { reconcileCustomerMatchMemberships } from "@/features/google-ads/customer-match-reconciliation";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Google Ads Customer Match reconciliation is owner-only.",
    );
  }

  const body = (await request.json().catch(() => null)) as { limit?: number } | null;
  const limit = Number.isFinite(body?.limit) ? Math.trunc(body?.limit ?? 100) : 100;
  const result = await reconcileCustomerMatchMemberships(limit);
  return apiSuccess(result);
}
