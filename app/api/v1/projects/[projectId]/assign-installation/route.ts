import { NextRequest } from "next/server";

import { PROJECT_RUNTIME_MANAGER_ROLES } from "@/features/projects/api";
import {
  saveProjectInstallationEndDate,
  validateInstallationWindow,
} from "@/features/projects/lifecycle";
import { assignInstallationToProject } from "@/features/projects/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROJECT_RUNTIME_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Installation assignment denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        date?: string;
        end_date?: string | null;
        start_time?: string | null;
        end_time?: string | null;
        crew_id?: string;
        manager_notes?: string | null;
        assignments?: Array<{
          project_position_id?: string;
          installer_id?: string;
        }>;
      }
    | null;

  const { projectId } = await context.params;

  if (!body?.date || !body.crew_id || !body.assignments || !Array.isArray(body.assignments)) {
    return apiError(
      400,
      "invalid_payload",
      "date, crew_id, and complete installer assignments are required.",
    );
  }

  if (validateInstallationWindow(body.date, body.end_date)) {
    return apiError(400, "invalid_install_window", "Installation end date cannot be earlier than start date.");
  }

  const result = await assignInstallationToProject(auth.session, {
    project_id: projectId,
    date: body.date,
    start_time: body.start_time ?? null,
    end_time: body.end_time ?? null,
    crew_id: body.crew_id,
    manager_notes: typeof body.manager_notes === "string" ? body.manager_notes : null,
    assignments: body.assignments.flatMap((assignment) =>
      assignment.project_position_id && assignment.installer_id
        ? [
            {
              project_position_id: assignment.project_position_id,
              installer_id: assignment.installer_id,
            },
          ]
        : [],
    ),
  });

  if (!result) {
    return apiError(404, "not_found", "Project was not found.");
  }

  if (result === "crew_not_found") {
    return apiError(404, "crew_not_found", "Crew was not found.");
  }

  if (result === "invalid_schedule") {
    return apiError(400, "invalid_schedule", "Schedule date or time is invalid.");
  }

  if (result === "missing_assignments") {
    return apiError(400, "missing_assignments", "At least one installer assignment is required.");
  }

  if (result === "missing_positions") {
    return apiError(409, "missing_positions", "Project does not contain assignable positions.");
  }

  if (result === "incomplete_assignments") {
    return apiError(409, "incomplete_assignments", "Every project position must have an installer assignment.");
  }

  if (result === "duplicate_position_assignment") {
    return apiError(409, "duplicate_position_assignment", "Each project position can only be assigned once.");
  }

  if (result === "invalid_position") {
    return apiError(400, "invalid_position", "One or more project positions do not belong to this project.");
  }

  if (result === "invalid_installer") {
    return apiError(400, "invalid_installer", "One or more installers are invalid.");
  }

  const installationWindow = await saveProjectInstallationEndDate(auth.session, {
    project_id: projectId,
    start_date: body.date,
    end_date: body.end_date ?? body.date,
  });

  if (!installationWindow) {
    return apiError(404, "not_found", "Project was not found while saving the installation window.");
  }

  if (installationWindow === "invalid_install_window") {
    return apiError(400, "invalid_install_window", "Installation date window is invalid.");
  }

  if (installationWindow === "missing_schedule") {
    return apiError(409, "missing_schedule", "Installation schedule was not created.");
  }

  return apiSuccess({
    assignment: result.assignment,
    items: result.items,
    installation_window: installationWindow,
  });
}
