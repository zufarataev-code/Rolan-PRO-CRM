import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { CONSULTATION_ACCESS_ROLES } from "@/features/consultations/api";
import { getConsultationByIdForSession, updateSurveyForm } from "@/features/consultations/service";

type RouteContext = {
  params: Promise<{
    consultationId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Survey access denied.");
  }

  const { consultationId } = await context.params;
  const consultation = await getConsultationByIdForSession(auth.session, consultationId);

  if (!consultation?.survey) {
    return apiError(404, "not_found", "Survey was not found.");
  }

  return apiSuccess({
    survey: consultation.survey,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Survey update denied.");
  }

  const { consultationId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        summary_notes?: string | null;
        electrical_notes?: string | null;
        smart_recommended?: boolean;
        solar_recommended?: boolean;
        safety_recommended?: boolean;
        status?: string;
      }
    | null;

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const survey = await updateSurveyForm(auth.session, consultationId, body);

  if (!survey) {
    return apiError(404, "not_found", "Survey was not found.");
  }

  return apiSuccess({
    survey_id: survey.survey_id,
  });
}
