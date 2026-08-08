import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PROPOSAL_MANAGER_ROLES } from "@/features/proposals/api";
import { sendProposal } from "@/features/proposals/service";

type RouteContext = {
  params: Promise<{
    proposalId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Proposal sending denied.");
  }

  const { proposalId } = await context.params;
  const proposal = await sendProposal(auth.session, proposalId);

  if (!proposal) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  if (proposal === "locked") {
    return apiError(409, "proposal_locked", "Proposal is already approved and cannot be re-opened for edits.");
  }

  return apiSuccess({
    proposal,
  });
}
