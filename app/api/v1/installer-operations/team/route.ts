import { NextRequest } from "next/server";

import { getInstallerTeamOverview } from "@/features/installer-operations/service";
import { PROJECT_RUNTIME_MANAGER_ROLES } from "@/features/projects/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_RUNTIME_MANAGER_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Доступ запрещён.");
  return apiSuccess({ installers: await getInstallerTeamOverview() });
}
