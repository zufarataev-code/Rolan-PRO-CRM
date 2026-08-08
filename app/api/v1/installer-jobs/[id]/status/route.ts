import { NextRequest } from "next/server";

import { INSTALLER_RUNTIME_ROLES } from "@/features/projects/api";
import { updateInstallerJobStatus } from "@/features/projects/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, INSTALLER_RUNTIME_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Installer job status update denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        status?: string;
      }
    | null;

  if (!body?.status) {
    return apiError(400, "invalid_payload", "status is required.");
  }

  const { id } = await context.params;
  const job = await updateInstallerJobStatus(auth.session, id, body.status);

  if (!job) {
    return apiError(404, "not_found", "Installer job was not found.");
  }

  if (job === "invalid_status") {
    return apiError(400, "invalid_status", "Installer job status is invalid.");
  }

  if (job === "invalid_transition") {
    return apiError(409, "invalid_transition", "Installer job status transition is not allowed.");
  }

  return apiSuccess({
    job,
  });
}
