import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getPublicProposal } from "@/features/proposals/service";

type RouteContext = {
  params: Promise<{
    accessToken: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { accessToken } = await context.params;
  const proposal = await getPublicProposal(accessToken);

  if (!proposal) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  return apiSuccess({
    proposal,
  });
}
