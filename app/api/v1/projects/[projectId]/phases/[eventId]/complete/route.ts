import { NextRequest } from "next/server";

import { PROJECT_RUNTIME_MANAGER_ROLES } from "@/features/projects/api";
import { completeProjectPhase } from "@/features/projects/phases";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{ projectId: string; eventId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROJECT_RUNTIME_MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project phase completion denied.");
  }

  const { projectId, eventId } = await context.params;
  const result = await completeProjectPhase(auth.session, projectId, eventId);

  if (!result) return apiError(404, "not_found", "Installation phase was not found.");
  if (result === "missing_installers") {
    return apiError(409, "missing_installers", "Assign at least one installer before completing the phase.");
  }
  if (result === "missing_status_config") {
    return apiError(500, "missing_status_config", "Completion status configuration is missing.");
  }

  return apiSuccess(result);
}
