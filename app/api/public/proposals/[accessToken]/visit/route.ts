import { getPublicVisit, requestPublicVisitChange } from "@/features/proposals/client-visit";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = { params: Promise<{ accessToken: string }> };

const MESSAGES: Record<string, [number, string]> = {
  not_found: [404, "Proposal was not found."],
  no_visit: [409, "There is no scheduled visit to change."],
  already_requested: [409, "Your request was already sent. The manager will contact you."],
  invalid_time: [400, "Choose a future date and time."],
  invalid_reason: [400, "Please write a short reason."],
};

export async function GET(_request: Request, context: RouteContext) {
  const { accessToken } = await context.params;
  const visit = await getPublicVisit(accessToken);
  if (visit === undefined) return apiError(404, "not_found", MESSAGES.not_found[1]);
  return apiSuccess({ visit });
}

export async function POST(request: Request, context: RouteContext) {
  const { accessToken } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: unknown; requested_at?: unknown; reason?: unknown } | null;
  if (body?.action !== "reschedule" && body?.action !== "cancel") return apiError(400, "invalid_action", "Unsupported request.");
  const result = await requestPublicVisitChange(accessToken, {
    action: body.action,
    requestedAt: typeof body.requested_at === "string" ? body.requested_at : null,
    reason: typeof body.reason === "string" ? body.reason : "",
  });
  if (typeof result === "string") {
    const [status, message] = MESSAGES[result] || [400, "Request failed."];
    return apiError(status, result, message);
  }
  return apiSuccess({ visit: result });
}
