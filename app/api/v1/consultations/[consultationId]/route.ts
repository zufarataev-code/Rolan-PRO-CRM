import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { CONSULTATION_ACCESS_ROLES } from "@/features/consultations/api";
import { getConsultationByIdForSession, updateConsultation } from "@/features/consultations/service";

type RouteContext = {
  params: Promise<{
    consultationId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Consultation access denied.");
  }

  const { consultationId } = await context.params;
  const consultation = await getConsultationByIdForSession(auth.session, consultationId);

  if (!consultation) {
    return apiError(404, "not_found", "Consultation was not found.");
  }

  return apiSuccess({
    consultation,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Consultation update denied.");
  }

  const { consultationId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        location_address?: string | null;
        scheduled_start_at?: string;
        scheduled_end_at?: string;
        manager_notes?: string | null;
        consultant_notes?: string | null;
        assigned_consultant_id?: string | null;
        assigned_manager_id?: string | null;
        status?: string;
      }
    | null;

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const updated = await updateConsultation(auth.session, consultationId, body);

  if (!updated) {
    return apiError(404, "not_found", "Consultation was not found.");
  }

  return apiSuccess({
    consultation_id: updated.consultation_id,
  });
}
