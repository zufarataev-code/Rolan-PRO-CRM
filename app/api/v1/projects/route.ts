import { NextRequest } from "next/server";

import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { launchProjectFromClosedSale } from "@/features/projects/launch";
import { listProjectsForSession } from "@/features/projects/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Projects access denied.");
  }

  const items = await listProjectsForSession(auth.session);

  return apiSuccess({ items });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, PROJECT_ACCESS_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Project launch denied.");
  }

  const body = (await request.json().catch(() => null)) as { proposal_id?: string } | null;

  if (!body?.proposal_id) {
    return apiError(400, "invalid_payload", "proposal_id is required.");
  }

  const project = await launchProjectFromClosedSale(auth.session, {
    proposal_id: body.proposal_id,
  });

  if (!project) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  if (project === "agreement_not_signed") {
    return apiError(409, "agreement_not_signed", "Agreement must be signed before the project can be launched.");
  }

  if (project === "deposit_not_paid") {
    return apiError(409, "deposit_not_paid", "Deposit must be paid before the project can be launched.");
  }

  if (project === "sale_not_closed") {
    return apiError(409, "sale_not_closed", "The sale must be CLOSED_WON before the project can be launched.");
  }

  if (project === "proposal_not_approved") {
    return apiError(409, "proposal_not_approved", "Proposal must be approved before the project can be launched.");
  }

  if (project === "missing_selection") {
    return apiError(409, "missing_selection", "At least one selected proposal item is required to launch a project.");
  }

  if (project === "missing_status_config") {
    return apiError(500, "missing_status_config", "Project or position status configuration is missing.");
  }

  return apiSuccess({
    project,
    project_id: project.project_id,
  });
}
