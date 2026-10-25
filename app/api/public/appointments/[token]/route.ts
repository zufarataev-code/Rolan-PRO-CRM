import { apiError, apiSuccess } from "@/lib/http/api-response";
import {
  getPublicAppointment,
  submitPublicAppointmentRequest,
} from "@/features/legacy-crm/public-appointments";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const appointment = await getPublicAppointment(token);
  if (!appointment) return apiError(404, "not_found", "Appointment was not found.");
  return apiSuccess({ appointment });
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const body = await request.json().catch(() => null) as {
    type?: string;
    requestedAt?: string | null;
    reason?: string;
  } | null;
  const type = body?.type;
  const reason = body?.reason?.trim() || "";
  const requestedAt = body?.requestedAt?.trim() || null;

  if (type !== "reschedule" && type !== "cancel") {
    return apiError(400, "invalid_request_type", "Choose reschedule or cancel.");
  }
  if (reason.length < 3 || reason.length > 500) {
    return apiError(400, "invalid_reason", "Reason must contain between 3 and 500 characters.");
  }
  if (
    type === "reschedule" &&
    (!requestedAt || Number.isNaN(Date.parse(requestedAt)) || Date.parse(requestedAt) <= Date.now())
  ) {
    return apiError(400, "invalid_requested_at", "A valid requested date is required.");
  }

  const result = await submitPublicAppointmentRequest(token, { type, requestedAt, reason });
  if (!result.ok) {
    const status = result.code === "revision_conflict" ? 409 : 404;
    return apiError(status, result.code, "The appointment request could not be saved.");
  }
  return apiSuccess({ appointment: result.appointment });
}
