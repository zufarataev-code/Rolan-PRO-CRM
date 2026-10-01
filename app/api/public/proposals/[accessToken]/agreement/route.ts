import { signPublicAgreement } from "@/features/proposals/service";
import { closeSaleIfReady } from "@/features/sales/close-sale";
import { apiError, apiSuccess } from "@/lib/http/api-response";

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
        signature_image?: string | null;
      }
    | null;

  if (!body?.signer_name || !body.signer_email || !body.signature_text) {
    return apiError(400, "invalid_payload", "signer_name, signer_email and signature_text are required.");
  }

  // A drawn signature is a small PNG data URL; anything else is refused.
  const signatureImage = typeof body.signature_image === "string" ? body.signature_image : null;
  if (signatureImage && (!signatureImage.startsWith("data:image/png;base64,") || signatureImage.length > 400_000)) {
    return apiError(400, "invalid_signature", "Signature must be a PNG image under 300 KB.");
  }

  const { accessToken } = await context.params;
  const proposal = await signPublicAgreement(accessToken, {
    signer_name: body.signer_name,
    signer_email: body.signer_email,
    signer_title: body.signer_title,
    signature_text: body.signature_text,
    client_notes: body.client_notes,
    accepted_terms: Boolean(body.accepted_terms),
    signature_image: signatureImage,
    signer_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    signer_user_agent: request.headers.get("user-agent"),
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

  const sale = await closeSaleIfReady({ accessToken });

  return apiSuccess({
    proposal,
    sale,
  });
}
