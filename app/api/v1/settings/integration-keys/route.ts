import { NextRequest } from "next/server";

import { createIntegrationKey, integrationKeySummary, isIntegrationName, revokeIntegrationKeys } from "@/features/integrations/api-keys";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Owner only: whether a key is active (never the key itself). */
export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Integration keys are the owner's.");
  const integration = request.nextUrl.searchParams.get("integration") ?? "google_ads";
  if (!isIntegrationName(integration)) return apiError(400, "unknown_integration", "Unknown integration.");
  return apiSuccess(await integrationKeySummary(integration));
}

/** Owner only: a new key (shown once); the previous one stops working. */
export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Integration keys are the owner's.");
  const body = (await request.json().catch(() => null)) as { integration?: unknown } | null;
  const integration = body?.integration ?? "google_ads";
  if (!isIntegrationName(integration)) return apiError(400, "unknown_integration", "Unknown integration.");
  return apiSuccess(await createIntegrationKey(integration, auth.session.user.user_id));
}

/** Owner only: switch the key off. */
export async function DELETE(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Integration keys are the owner's.");
  const integration = request.nextUrl.searchParams.get("integration") ?? "google_ads";
  if (!isIntegrationName(integration)) return apiError(400, "unknown_integration", "Unknown integration.");
  return apiSuccess(await revokeIntegrationKeys(integration));
}
