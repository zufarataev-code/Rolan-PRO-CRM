import { apiError, apiSuccess } from "@/lib/http/api-response";
import { updatePublicProposalSelections } from "@/features/proposals/service";

type RouteContext = {
  params: Promise<{
    accessToken: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const body = (await request.json().catch(() => null)) as
    | {
        items?: Array<{
          proposal_item_id: string;
          client_selected: boolean;
        }>;
        client_message?: string | null;
      }
    | null;

  if (!body?.items || !Array.isArray(body.items)) {
    return apiError(400, "invalid_payload", "items array is required.");
  }

  const { accessToken } = await context.params;
  const proposal = await updatePublicProposalSelections(accessToken, {
    items: body.items,
    client_message: body.client_message,
  });

  if (!proposal) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  if (proposal === "locked") {
    return apiError(409, "proposal_locked", "Proposal is already finalized and can no longer be changed.");
  }

  return apiSuccess({
    proposal,
  });
}
