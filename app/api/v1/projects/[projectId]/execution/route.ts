import { NextRequest } from "next/server";
import { listProjectPhases } from "@/features/projects/phases";
import { getProjectExecutionOptions } from "@/features/projects/service";
import { isProjectConstructorUuid } from "@/features/projects/constructor-request";
import { PROJECT_RUNTIME_MANAGER_ROLES } from "@/features/projects/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireRequestSession(request, PROJECT_RUNTIME_MANAGER_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Service execution access denied.");
  const { projectId } = await context.params;
  if (!isProjectConstructorUuid(projectId)) return apiError(400, "invalid_project", "A valid project ID is required.");
  const phases = await listProjectPhases(auth.session, projectId);
  if (!phases) return apiError(404, "not_found", "Project was not found.");
  return apiSuccess({ phases, ...await getProjectExecutionOptions() });
}
