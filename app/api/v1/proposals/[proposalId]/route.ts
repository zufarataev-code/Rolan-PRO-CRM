import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PROPOSAL_MANAGER_ROLES } from "@/features/proposals/api";
import { getProposalById, updateProposal } from "@/features/proposals/service";

type RouteContext = {
  params: Promise<{
    proposalId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Proposal access denied.");
  }

  const { proposalId } = await context.params;
  const proposal = await getProposalById(auth.session, proposalId);

  if (!proposal) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  return apiSuccess({
    proposal,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Proposal update denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        client_message?: string | null;
        notes?: string | null;
        expires_at?: string | null;
      }
    | null;

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const { proposalId } = await context.params;
  const proposal = await updateProposal(auth.session, proposalId, body);

  if (!proposal) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  if (proposal === "locked") {
    return apiError(409, "proposal_locked", "Proposal is approved and can no longer be edited.");
  }

  return apiSuccess({
    proposal,
  });
}
