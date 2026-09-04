import { NextRequest } from "next/server";

import { PROJECT_RUNTIME_MANAGER_ROLES } from "@/features/projects/api";
import { completeProjectInstallation } from "@/features/projects/lifecycle";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROJECT_RUNTIME_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Installation completion denied.");
  }

  const { projectId } = await context.params;
  const result = await completeProjectInstallation(auth.session, projectId);

  if (!result) {
    return apiError(404, "not_found", "Project was not found.");
  }

  if (result === "missing_status_config") {
    return apiError(409, "missing_status_config", "Completed project statuses are not configured.");
  }

  return apiSuccess({ completion: result });
}
