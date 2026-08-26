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
  let proposal;
  try {
    proposal = await sendProposal(auth.session, proposalId);
  } catch (error) {
    return apiError(502, "proposal_email_failed", error instanceof Error ? error.message : "Proposal email could not be sent.");
  }

  if (!proposal) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  if (proposal === "locked") {
    return apiError(409, "proposal_locked", "Proposal is already approved and cannot be re-opened for edits.");
  }

  if (proposal === "missing_email") {
    return apiError(409, "client_email_missing", "Add a valid client email before sending the proposal.");
  }

  return apiSuccess({
    proposal,
  });
}
