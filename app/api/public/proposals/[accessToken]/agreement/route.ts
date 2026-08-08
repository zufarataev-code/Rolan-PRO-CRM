import { apiError, apiSuccess } from "@/lib/http/api-response";
import { signPublicAgreement } from "@/features/proposals/service";

type RouteContext = {
  params: Promise<{
    accessToken: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const body = (await request.json().catch(() => null)) as
    | {
        signer_name?: string;
        signer_email?: string;
        signer_title?: string | null;
        signature_text?: string;
        client_notes?: string | null;
        accepted_terms?: boolean;
      }
    | null;

  if (!body?.signer_name || !body.signer_email || !body.signature_text) {
    return apiError(400, "invalid_payload", "signer_name, signer_email and signature_text are required.");
  }

  const { accessToken } = await context.params;
  const proposal = await signPublicAgreement(accessToken, {
    signer_name: body.signer_name,
    signer_email: body.signer_email,
    signer_title: body.signer_title,
    signature_text: body.signature_text,
    client_notes: body.client_notes,
    accepted_terms: Boolean(body.accepted_terms),
  });

  if (!proposal) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  if (proposal === "terms_required") {
    return apiError(400, "terms_required", "Client must accept the agreement terms.");
  }

  if (proposal === "locked") {
    return apiError(409, "proposal_locked", "Proposal is already approved and can no longer be re-signed.");
  }

  return apiSuccess({
    proposal,
  });
}
