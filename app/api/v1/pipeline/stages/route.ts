import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MANAGER_ROLES } from "@/features/sales/api";
import { getPipelineStagesWithTransitions } from "@/features/sales/service";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Pipeline stages access denied.");
  }

  const data = await getPipelineStagesWithTransitions();

  return apiSuccess({
    items: data,
  });
}
