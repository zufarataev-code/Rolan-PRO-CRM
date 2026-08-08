import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MANAGER_ROLES, getManagerScope } from "@/features/sales/api";
import { getPipelineBoard } from "@/features/sales/service";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Pipeline board access denied.");
  }

  const managerId = getManagerScope(request, auth.session);
  const data = await getPipelineBoard(managerId);

  return apiSuccess({
    columns: data,
  });
}
