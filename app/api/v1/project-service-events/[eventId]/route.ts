import { NextRequest } from "next/server";
import { listServiceExecutionEvents } from "@/features/projects/service-execution";
import { isProjectConstructorUuid } from "@/features/projects/constructor-request";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER, ROLE_CODES.INSTALLER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Work order access denied.");
  const { eventId } = await context.params;
  if (!isProjectConstructorUuid(eventId)) return apiError(400, "invalid_event", "A valid work order ID is required.");
  const [item] = await listServiceExecutionEvents(auth.session, eventId);
  if (!item) return apiError(404, "not_found", "Work order was not found.");
  return apiSuccess({ item });
}
