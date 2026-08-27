import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES, getManagerScope, getPipelineStatusId } from "@/features/sales/api";
import { getRecordManagerScope, isCrossManagerAssignment } from "@/features/sales/access";
import { listLeads } from "@/features/sales/service";
import { onLeadCreated } from "@/features/core/events";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Leads access denied.");
  }

  const managerId = getManagerScope(request, auth.session);
  const data = await listLeads(managerId);

  return apiSuccess({
    items: data,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Lead creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        phone?: string;
        email?: string;
        source?: string;
        notes?: string;
        city_id?: string;
        assigned_manager_id?: string;
        pipeline_status_code?: string;
      }
    | null;

  if (!body?.name?.trim()) {
    return apiError(400, "invalid_payload", "Lead name is required.");
  }

  const recordManagerId = getRecordManagerScope(auth.session);

  if (isCrossManagerAssignment(recordManagerId, body.assigned_manager_id)) {
    return apiError(403, "forbidden", "Managers cannot assign leads to another user.");
  }

  const trimmedName = body.name.trim();

  const pipelineStatus =
    (body.pipeline_status_code ? await getPipelineStatusId(body.pipeline_status_code) : null) ??
    (await getPipelineStatusId("NEW_LEAD"));

  if (!pipelineStatus) {
    return apiError(500, "missing_pipeline_status", "Default pipeline status is not configured.");
  }

  const assignedManagerId = recordManagerId ?? body.assigned_manager_id ?? null;

  const lead = await prisma.$transaction(async (tx) => {
    const createdLead = await tx.lead.create({
      data: {
        name: trimmedName,
        phone: body.phone?.trim() || null,
        email: body.email?.trim().toLowerCase() || null,
        source: body.source?.trim() || null,
        notes: body.notes?.trim() || null,
        city_id: body.city_id ?? null,
        assigned_manager_id: assignedManagerId,
        pipeline_status_id: pipelineStatus.pipeline_status_id,
      },
    });

    if (pipelineStatus.status_code === "NEW_LEAD" || pipelineStatus.status_code === "LEAD") {
      await onLeadCreated(tx, {
        actorUserId: auth.session.user.user_id,
        leadId: createdLead.lead_id,
        managerUserId: assignedManagerId,
        leadNameOrTitle: createdLead.name,
      });
    }

    return createdLead;
  });

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "lead",
    entityId: lead.lead_id,
    actionKey: "lead.created",
    message: `Создан лид ${lead.name}.`,
    metadata: {
      pipeline_status_code: pipelineStatus.status_code,
    },
  });

  return apiSuccess({
    lead_id: lead.lead_id,
  });
}
