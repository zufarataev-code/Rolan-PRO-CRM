import { NextRequest } from "next/server";

import { PROPOSAL_MANAGER_ROLES } from "@/features/proposals/api";
import { markDepositPaid } from "@/features/proposals/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = {
  params: Promise<{
    depositId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Deposit payment update denied.");
  }

  const { depositId } = await context.params;
  const result = await markDepositPaid(auth.session, depositId);

  if (!result) {
    return apiError(404, "not_found", "Deposit was not found.");
  }

  if (result === "proposal_not_approved") {
    return apiError(409, "proposal_not_approved", "Proposal must remain approved before deposit payment is recorded.");
  }

  return apiSuccess(result);
}
