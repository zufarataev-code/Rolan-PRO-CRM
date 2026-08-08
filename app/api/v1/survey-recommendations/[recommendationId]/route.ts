import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { CONSULTATION_ACCESS_ROLES } from "@/features/consultations/api";
import { updateSurveyRecommendation } from "@/features/consultations/service";

type RouteContext = {
  params: Promise<{
    recommendationId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Recommendation update denied.");
  }

  const { recommendationId } = await context.params;
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

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const updated = await updateSurveyRecommendation(auth.session, recommendationId, body);

  if (!updated) {
    return apiError(404, "not_found", "Recommendation was not found.");
  }

  return apiSuccess({
    survey_recommendation_id: updated.survey_recommendation_id,
  });
}
