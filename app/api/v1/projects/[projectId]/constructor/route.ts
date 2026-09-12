import { NextRequest } from "next/server";

import { PROJECT_CONSTRUCTOR_ACCESS_ROLES } from "@/features/projects/api";
import { isProjectConstructorUuid, parseProjectConstructorPatch } from "@/features/projects/constructor-request";
import {
  getProjectConstructorForSession,
  updateProjectConstructorForSession,
} from "@/features/projects/constructor-service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROJECT_CONSTRUCTOR_ACCESS_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project constructor access denied.");

  const { projectId } = await context.params;
  if (!isProjectConstructorUuid(projectId)) return apiError(400, "invalid_project_id", "A valid project ID is required.");
  const constructor = await getProjectConstructorForSession(auth.session, projectId);
  if (!constructor) return apiError(404, "not_found", "Project was not found.");
  return apiSuccess({ constructor });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROJECT_CONSTRUCTOR_ACCESS_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project constructor update denied.");

  const input = parseProjectConstructorPatch(await request.json().catch(() => null));
  if (!input) return apiError(400, "invalid_payload", "Valid constructor changes are required.");
  const { projectId } = await context.params;
  if (!isProjectConstructorUuid(projectId)) return apiError(400, "invalid_project_id", "A valid project ID is required.");
  const result = await updateProjectConstructorForSession(auth.session, projectId, input);
  if (!result) return apiError(404, "not_found", "Project was not found.");
  if (typeof result === "string") {
    const status = result === "missing_status_config" ? 500 : result === "forbidden_change" ? 403 : 400;
    return apiError(status, result, "Project constructor change was rejected.");
  }
  return apiSuccess({ constructor: result });
}
