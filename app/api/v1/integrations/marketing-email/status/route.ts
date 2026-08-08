import { NextRequest } from "next/server";

import { marketingEmailConfig } from "@/features/email/marketing";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Marketing email access denied.");
  try {
    return apiSuccess(marketingEmailConfig());
  } catch (error) {
    return apiError(500, "marketing_email_configuration_error", error instanceof Error ? error.message : "Marketing email configuration error.");
  }
}
