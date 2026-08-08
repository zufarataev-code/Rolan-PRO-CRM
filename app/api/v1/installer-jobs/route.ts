import { NextRequest } from "next/server";

import { PROJECT_RUNTIME_MANAGER_ROLES } from "@/features/projects/api";
import { createInstallerJobsForProject } from "@/features/projects/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_RUNTIME_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Installer job creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        project_id?: string;
        crew_id?: string | null;
        assignments?: Array<{
          project_position_id?: string;
          installer_id?: string;
        }>;
      }
    | null;

  if (!body?.project_id || !body.assignments || !Array.isArray(body.assignments)) {
    return apiError(400, "invalid_payload", "project_id and assignments are required.");
  }

  const jobs = await createInstallerJobsForProject(auth.session, {
    project_id: body.project_id,
    crew_id: body.crew_id ?? null,
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

  if (!jobs) {
    return apiError(404, "not_found", "Project was not found.");
  }

  if (jobs === "missing_assignments") {
    return apiError(400, "missing_assignments", "At least one project position assignment is required.");
  }

  if (jobs === "missing_positions") {
    return apiError(409, "missing_positions", "Project does not contain assignable positions.");
  }

  if (jobs === "incomplete_assignments") {
    return apiError(409, "incomplete_assignments", "Every project position must have an installer assignment.");
  }

  if (jobs === "duplicate_position_assignment") {
    return apiError(409, "duplicate_position_assignment", "Each project position can only be assigned once.");
  }

  if (jobs === "invalid_position") {
    return apiError(400, "invalid_position", "One or more project positions do not belong to this project.");
  }

  if (jobs === "invalid_installer") {
    return apiError(400, "invalid_installer", "One or more installers are invalid.");
  }

  if (jobs === "missing_schedule") {
    return apiError(409, "missing_schedule", "Create the project schedule before installer jobs are assigned.");
  }

  return apiSuccess({
    items: jobs,
  });
}
