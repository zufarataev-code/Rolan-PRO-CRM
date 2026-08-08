import { NextRequest } from "next/server";

import { PROPOSAL_MANAGER_ROLES } from "@/features/proposals/api";
import { createDepositForProposal } from "@/features/proposals/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Deposit creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        proposal_id?: string;
        amount?: number | null;
      }
    | null;

  if (!body?.proposal_id) {
    return apiError(400, "invalid_payload", "proposal_id is required.");
  }

  const result = await createDepositForProposal(auth.session, {
    proposal_id: body.proposal_id,
    amount: body.amount ?? null,
  });

  if (!result) {
    return apiError(404, "not_found", "Approved proposal was not found.");
  }

  if (result === "proposal_not_approved") {
    return apiError(409, "proposal_not_approved", "Proposal must be approved before a deposit can be created.");
  }

  if (result === "invalid_amount") {
    return apiError(400, "invalid_amount", "Deposit amount must be greater than zero.");
  }

  return apiSuccess(result);
}
