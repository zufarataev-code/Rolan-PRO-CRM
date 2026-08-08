import { NextRequest } from "next/server";

import { PROJECT_RUNTIME_MANAGER_ROLES } from "@/features/projects/api";
import { assignProjectSchedule } from "@/features/projects/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_RUNTIME_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Schedule assignment denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        project_id?: string;
        date?: string;
        start_time?: string | null;
        end_time?: string | null;
        crew_id?: string;
      }
    | null;

  if (!body?.project_id || !body.date || !body.crew_id) {
    return apiError(400, "invalid_payload", "project_id, date, and crew_id are required.");
  }

  const assignment = await assignProjectSchedule(auth.session, {
    project_id: body.project_id,
    date: body.date,
    start_time: body.start_time ?? null,
    end_time: body.end_time ?? null,
    crew_id: body.crew_id,
  });

  if (!assignment) {
    return apiError(404, "not_found", "Project was not found.");
  }

  if (assignment === "crew_not_found") {
    return apiError(404, "crew_not_found", "Crew was not found.");
  }

  if (assignment === "invalid_schedule") {
    return apiError(400, "invalid_schedule", "Schedule date or time is invalid.");
  }

  return apiSuccess({
    assignment,
  });
}
