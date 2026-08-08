import { NextRequest } from "next/server";

import { updatePlanningTagsForSession } from "@/features/calendar/service";
import { MANAGER_ROLES } from "@/features/sales/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function PATCH(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Planning tags update denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        entity_type?: "consultation" | "installation";
        entity_id?: string;
        tags?: string[];
      }
    | null;

  if (!body?.entity_type || !body.entity_id || !Array.isArray(body.tags)) {
    return apiError(400, "invalid_payload", "entity_type, entity_id and tags are required.");
  }

  const updated = await updatePlanningTagsForSession(auth.session, {
    entity_type: body.entity_type,
    entity_id: body.entity_id,
    tags: body.tags,
  });

  if (!updated) {
    return apiError(404, "not_found", "Planning item was not found.");
  }

  return apiSuccess(updated);
}
