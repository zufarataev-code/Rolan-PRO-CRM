import { NextRequest } from "next/server";

import { syncPrimaryGmail } from "@/features/gmail/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Gmail sync denied.");
  try {
    return apiSuccess(await syncPrimaryGmail());
  } catch (error) {
    return apiError(502, "gmail_sync_failed", error instanceof Error ? error.message : "Gmail sync failed.");
  }
}
