import { NextRequest } from "next/server";

import { PROJECT_CONSTRUCTOR_ACCESS_ROLES } from "@/features/projects/api";
import { listProjectConstructorSummariesForSession } from "@/features/projects/constructor-service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_CONSTRUCTOR_ACCESS_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project constructor access denied.");
  return apiSuccess({ items: await listProjectConstructorSummariesForSession(auth.session) });
}
