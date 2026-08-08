import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { CONSULTATION_ACCESS_ROLES } from "@/features/consultations/api";
import { addSurveyRecommendation, getConsultationByIdForSession } from "@/features/consultations/service";

type RouteContext = {
  params: Promise<{
    consultationId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Recommendations access denied.");
  }

  const { consultationId } = await context.params;
  const consultation = await getConsultationByIdForSession(auth.session, consultationId);

  if (!consultation?.survey) {
    return apiError(404, "not_found", "Survey was not found.");
  }

  return apiSuccess({
    items: consultation.survey.recommendations,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Recommendation create denied.");
  }

  const { consultationId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        measurement_id?: string | null;
        service_type_id?: string;
        film_id?: string | null;
        is_primary?: boolean;
        sort_order?: number;
        recommendation_notes?: string | null;
        electrical_notes?: string | null;
      }
    | null;

  if (!body?.service_type_id) {
    return apiError(400, "invalid_payload", "service_type_id is required.");
  }

  const recommendation = await addSurveyRecommendation(auth.session, consultationId, {
    measurement_id: body.measurement_id,
    service_type_id: body.service_type_id,
    film_id: body.film_id,
    is_primary: body.is_primary,
    sort_order: body.sort_order,
    recommendation_notes: body.recommendation_notes,
    electrical_notes: body.electrical_notes,
  });

  if (!recommendation) {
    return apiError(404, "not_found", "Consultation or survey was not found.");
  }

  return apiSuccess({
    survey_recommendation_id: recommendation.survey_recommendation_id,
  });
}
