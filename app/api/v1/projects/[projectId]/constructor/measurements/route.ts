import { NextRequest } from "next/server";

import { PROJECT_CONSTRUCTOR_ACCESS_ROLES } from "@/features/projects/api";
import { isProjectConstructorUuid, parseOpeningMeasurementInput } from "@/features/projects/constructor-request";
import { addProjectOpeningMeasurement } from "@/features/projects/constructor-service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROJECT_CONSTRUCTOR_ACCESS_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Measurement create denied.");

  const input = parseOpeningMeasurementInput(await request.json().catch(() => null));
  if (!input) return apiError(400, "invalid_payload", "A valid room, opening, source, glass profile and cell list are required.");
  const { projectId } = await context.params;
  if (!isProjectConstructorUuid(projectId)) return apiError(400, "invalid_project_id", "A valid project ID is required.");
  const result = await addProjectOpeningMeasurement(auth.session, projectId, input);
  if (!result) return apiError(404, "not_found", "Project was not found.");
  if (typeof result === "string") {
    const conflictCodes = new Set(["survey_required", "site_type_mismatch", "verified_revision_required"]);
    return apiError(result === "verified_source_required" ? 403 : conflictCodes.has(result) ? 409 : 400, result, "Opening measurement was rejected.");
  }
  return apiSuccess(result);
}
