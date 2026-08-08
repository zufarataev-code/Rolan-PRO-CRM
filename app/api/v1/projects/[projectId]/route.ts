import { NextRequest } from "next/server";

import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { getProjectCardByIdForSession } from "@/features/projects/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROJECT_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project card access denied.");
  }

  const { projectId } = await context.params;
  const project = await getProjectCardByIdForSession(auth.session, projectId);

  if (!project) {
    return apiError(404, "not_found", "Project was not found.");
  }

  return apiSuccess({
    project,
  });
}

