import { NextRequest } from "next/server";

import { LEGACY_WORKSPACE_ROLES } from "@/features/legacy-crm/api";
import { publishLegacyProposal, type LegacyProposalSnapshot } from "@/features/legacy-crm/publish-proposal";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, LEGACY_WORKSPACE_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Proposal publishing denied.");
  const body = await request.json().catch(() => null) as LegacyProposalSnapshot | null;
  if (!body) return apiError(400, "invalid_payload", "Proposal snapshot is required.");
  try {
    return apiSuccess({ proposal: await publishLegacyProposal(auth.session, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proposal could not be published.";
    return apiError(message.includes("signed proposal") ? 409 : 400, "proposal_publish_failed", message);
  }
}
