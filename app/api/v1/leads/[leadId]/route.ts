import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES, getPipelineStatusId } from "@/features/sales/api";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Lead update denied.");
  }

  const { leadId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        phone?: string | null;
        email?: string | null;
        source?: string | null;
        notes?: string | null;
        city_id?: string | null;
        assigned_manager_id?: string | null;
        pipeline_status_code?: string;
      }
    | null;

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const data: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    source?: string | null;
    notes?: string | null;
    city_id?: string | null;
    assigned_manager_id?: string | null;
    pipeline_status_id?: string;
  } = {};

  if (body.name !== undefined) data.name = body.name.trim();
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
  if (body.email !== undefined) data.email = body.email?.trim().toLowerCase() || null;
  if (body.source !== undefined) data.source = body.source?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  if (body.city_id !== undefined) data.city_id = body.city_id;
  if (body.assigned_manager_id !== undefined) data.assigned_manager_id = body.assigned_manager_id;

  if (body.pipeline_status_code) {
    const pipelineStatus = await getPipelineStatusId(body.pipeline_status_code);

    if (!pipelineStatus) {
      return apiError(400, "invalid_pipeline_status", "Pipeline status was not found.");
    }

    data.pipeline_status_id = pipelineStatus.pipeline_status_id;
  }

  const lead = await prisma.lead.update({
    where: {
      lead_id: leadId,
    },
    data,
  }).catch(() => null);

  if (!lead) {
    return apiError(404, "not_found", "Lead was not found.");
  }

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "lead",
    entityId: lead.lead_id,
    actionKey: "lead.updated",
    message: `Лид ${lead.name} обновлен.`,
  });

  return apiSuccess({
    lead_id: lead.lead_id,
  });
}
