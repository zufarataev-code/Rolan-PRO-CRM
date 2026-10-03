import { NextRequest } from "next/server";
import { listServiceExecutionEvents } from "@/features/projects/service-execution";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER, ROLE_CODES.INSTALLER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Service schedule access denied.");
  return apiSuccess({ items: await listServiceExecutionEvents(auth.session) });
}
