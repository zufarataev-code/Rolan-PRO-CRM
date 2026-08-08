import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { CONSULTATION_ACCESS_ROLES } from "@/features/consultations/api";
import { completeSurvey } from "@/features/consultations/service";

type RouteContext = {
  params: Promise<{
    consultationId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, CONSULTATION_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Survey completion denied.");
  }

  const { consultationId } = await context.params;
  const result = await completeSurvey(auth.session, consultationId);

  if (!result) {
    return apiError(404, "not_found", "Consultation or survey was not found.");
  }

  return apiSuccess(result);
}
