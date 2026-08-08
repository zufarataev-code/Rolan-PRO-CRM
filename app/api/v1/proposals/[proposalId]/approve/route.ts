import { NextRequest } from "next/server";

import { PROPOSAL_MANAGER_ROLES } from "@/features/proposals/api";
import { approveProposal } from "@/features/proposals/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{
    proposalId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Proposal approval denied.");
  }

  const { proposalId } = await context.params;
  const proposal = await approveProposal(auth.session, proposalId);

  if (!proposal) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  if (proposal === "missing_selection") {
    return apiError(409, "missing_selection", "At least one selected proposal item is required before approval.");
  }

  return apiSuccess({
    proposal,
  });
}
