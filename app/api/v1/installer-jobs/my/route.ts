import { NextRequest } from "next/server";

import { INSTALLER_ONLY_ROLES } from "@/features/projects/api";
import { getInstallerJobsForSession } from "@/features/projects/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, INSTALLER_ONLY_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Installer jobs access denied.");
  }

  const items = await getInstallerJobsForSession(auth.session);

  return apiSuccess({
    items,
  });
}
