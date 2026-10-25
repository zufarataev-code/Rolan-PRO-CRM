import { NextRequest } from "next/server";

import { clearServiceAccount, googleCredentialSummary, GoogleCredentialsError, saveServiceAccount } from "@/features/google-ads/credentials";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Owner only: whether Google access is set (the key itself never comes back). */
export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Google access is the owner's.");
  return apiSuccess(await googleCredentialSummary());
}

/** Owner only: the service-account JSON key, stored encrypted. */
export async function PUT(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Google access is the owner's.");
  const body = (await request.json().catch(() => null)) as { service_account_json?: unknown } | null;
  try {
    return apiSuccess(await saveServiceAccount(body?.service_account_json, auth.session.user.user_id));
  } catch (error) {
    if (error instanceof GoogleCredentialsError) return apiError(400, "invalid_service_account", error.message);
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Google access is the owner's.");
  return apiSuccess(await clearServiceAccount());
}
