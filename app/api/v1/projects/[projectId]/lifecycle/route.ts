import { NextRequest } from "next/server";

import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { getProjectLifecycleSummary } from "@/features/projects/lifecycle";
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
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project lifecycle access denied.");
  }

  const { projectId } = await context.params;
  const lifecycle = await getProjectLifecycleSummary(auth.session, projectId);

  if (!lifecycle) {
    return apiError(404, "not_found", "Project was not found.");
  }

  return apiSuccess({ lifecycle });
}
