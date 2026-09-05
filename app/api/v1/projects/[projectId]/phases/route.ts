import { NextRequest } from "next/server";

import { PROJECT_RUNTIME_MANAGER_ROLES } from "@/features/projects/api";
import { createProjectPhase, listProjectPhases, type CreateProjectPhaseInput } from "@/features/projects/phases";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROJECT_RUNTIME_MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project phases access denied.");
  }

  const { projectId } = await context.params;
  const items = await listProjectPhases(auth.session, projectId);
  if (!items) return apiError(404, "not_found", "Project was not found.");

  return apiSuccess({ items });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROJECT_RUNTIME_MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project phase creation denied.");
  }

  const body = (await request.json().catch(() => null)) as Partial<CreateProjectPhaseInput> | null;
  if (!body?.title || !body.starts_at || !body.ends_at || !Array.isArray(body.position_ids)) {
    return apiError(400, "invalid_payload", "title, starts_at, ends_at and position_ids are required.");
  }

  const { projectId } = await context.params;
  const result = await createProjectPhase(auth.session, projectId, {
    title: body.title,
    starts_at: body.starts_at,
    ends_at: body.ends_at,
    client_confirmed: Boolean(body.client_confirmed),
    client_confirmation_note: body.client_confirmation_note ?? null,
    crew_id: body.crew_id ?? null,
    position_ids: body.position_ids,
    assignments: Array.isArray(body.assignments) ? body.assignments : [],
    notes: body.notes ?? null,
  });

  if (!result) return apiError(404, "not_found", "Project was not found.");

  const conflicts: Record<string, string> = {
    invalid_phase: "Phase date range or title is invalid.",
    missing_positions: "Select at least one service/position for this phase.",
    missing_installers: "Assign an installer before scheduling this installation phase.",
    unassigned_positions: "Every service/position in this phase must have a responsible installer.",
    invalid_position: "One or more selected positions do not belong to this project.",
    invalid_assignment: "Installer assignment does not match the selected phase positions.",
    duplicate_assignment: "A project position can be assigned only once inside a phase.",
    position_already_assigned: "One or more selected services are already scheduled in another installation phase.",
    invalid_installer: "One or more installers are invalid or inactive.",
    invalid_crew: "Crew is invalid or inactive.",
    project_completed: "Completed projects cannot receive new installation phases.",
  };

  if (typeof result === "string") {
    if (result === "missing_status_config") {
      return apiError(500, result, "Installation status configuration is missing.");
    }
    return apiError(409, result, conflicts[result] ?? "Project phase could not be created.");
  }

  return apiSuccess({ phase: result });
}
