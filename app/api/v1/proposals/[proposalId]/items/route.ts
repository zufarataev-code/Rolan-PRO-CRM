import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PROPOSAL_MANAGER_ROLES } from "@/features/proposals/api";
import { addProposalItem } from "@/features/proposals/service";

type RouteContext = {
  params: Promise<{
    proposalId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Proposal item creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        measurement_id?: string | null;
        service_type_id?: string;
        film_id?: string | null;
        room_name?: string | null;
        zone_name?: string | null;
        window_id?: string | null;
        title_ru?: string;
        title_en?: string;
        description_ru?: string | null;
        description_en?: string | null;
        dynamic_fields?: Record<string, string | number | boolean | null> | null;
        addons_snapshot?: unknown[] | null;
        quantity?: number;
        unit_label?: string | null;
        line_price?: number;
        is_optional?: boolean;
        client_selected?: boolean;
      }
    | null;

  if (!body?.service_type_id || body.line_price === undefined) {
    return apiError(400, "invalid_payload", "service_type_id and line_price are required.");
  }

  const { proposalId } = await context.params;
  const proposal = await addProposalItem(auth.session, proposalId, {
    ...body,
    service_type_id: body.service_type_id,
    title_ru: body.title_ru ?? "",
    title_en: body.title_en ?? "",
    line_price: body.line_price,
  });

  if (!proposal) {
    return apiError(404, "not_found", "Proposal was not found.");
  }

  if (proposal === "locked") {
    return apiError(409, "proposal_locked", "Proposal is approved and can no longer be edited.");
  }

  return apiSuccess({
    proposal,
  });
}
