import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PROPOSAL_MANAGER_ROLES } from "@/features/proposals/api";
import { updateProposalItem } from "@/features/proposals/service";

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, PROPOSAL_MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Proposal item update denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
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

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const { itemId } = await context.params;
  const proposal = await updateProposalItem(auth.session, itemId, body);

  if (!proposal) {
    return apiError(404, "not_found", "Proposal item was not found.");
  }

  if (proposal === "locked") {
    return apiError(409, "proposal_locked", "Proposal is approved and can no longer be edited.");
  }

  return apiSuccess({
    proposal,
  });
}
