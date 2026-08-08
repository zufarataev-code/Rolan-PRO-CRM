import { NextRequest } from "next/server";

import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { createProjectFromProposal, listProjectsForSession } from "@/features/projects/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Projects access denied.");
  }

  const items = await listProjectsForSession(auth.session);

  return apiSuccess({
    items,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        proposal_id?: string;
      }
    | null;

  if (!body?.proposal_id) {
    return apiError(400, "invalid_payload", "proposal_id is required.");
  }

  const project = await createProjectFromProposal(auth.session, {
    proposal_id: body.proposal_id,
  });

  if (!project) {
    return apiError(404, "not_found", "Approved proposal was not found.");
  }

  if (project === "proposal_not_approved") {
    return apiError(409, "proposal_not_approved", "Proposal must be approved before project creation.");
  }

  if (project === "deposit_not_paid") {
    return apiError(409, "deposit_not_paid", "Deposit must be paid before project creation.");
  }

  if (project === "missing_selection") {
    return apiError(409, "missing_selection", "At least one selected proposal item is required to create a project.");
  }

  if (project === "missing_status_config") {
    return apiError(500, "missing_status_config", "Project or position status configuration is missing.");
  }

  return apiSuccess({
    project,
    project_id: project.project_id,
  });
}
