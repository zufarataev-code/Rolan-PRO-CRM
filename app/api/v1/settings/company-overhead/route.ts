import { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { readCompanyOverheadConfig, updateCompanyOverheadConfig } from "@/lib/finance/company-overhead";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Company overhead access denied.");
  }

  const config = await readCompanyOverheadConfig();
  return apiSuccess(config);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Company overhead update denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        patch?: Record<string, unknown>;
      }
    | null;

  if (!body?.patch || typeof body.patch !== "object") {
    return apiError(400, "invalid_payload", "patch is required.");
  }

  const updated = await updateCompanyOverheadConfig(body.patch);
  return apiSuccess(updated);
}
