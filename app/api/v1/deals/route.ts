import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES, getManagerScope, getPipelineStatusId } from "@/features/sales/api";
import { getRecordManagerScope, isCrossManagerAssignment } from "@/features/sales/access";
import { listDeals } from "@/features/sales/service";
import { onLeadCreated } from "@/features/core/events";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Deals access denied.");
  }

  const managerId = getManagerScope(request, auth.session);
  const data = await listDeals(managerId);

  return apiSuccess({
    items: data,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Deal creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        lead_id?: string | null;
        client_id?: string | null;
        title?: string;
        estimated_value?: number;
        currency?: string;
        notes?: string;
        assigned_manager_id?: string | null;
        pipeline_status_code?: string;
      }
    | null;

  if (!body?.title?.trim()) {
    return apiError(400, "invalid_payload", "Deal title is required.");
  }

  const recordManagerId = getRecordManagerScope(auth.session);

  if (isCrossManagerAssignment(recordManagerId, body.assigned_manager_id)) {
    return apiError(403, "forbidden", "Managers cannot assign deals to another user.");
  }

  const trimmedTitle = body.title.trim();

  const pipelineStatus =
    (body.pipeline_status_code ? await getPipelineStatusId(body.pipeline_status_code) : null) ??
    (await getPipelineStatusId("NEW_LEAD"));

  if (!pipelineStatus) {
    return apiError(500, "missing_pipeline_status", "Default pipeline status is not configured.");
  }

  const assignedManagerId = recordManagerId ?? body.assigned_manager_id ?? null;

  const deal = await prisma.$transaction(async (tx) => {
    const createdDeal = await tx.deal.create({
      data: {
        lead_id: body.lead_id ?? null,
        client_id: body.client_id ?? null,
        title: trimmedTitle,
        estimated_value: body.estimated_value ?? 0,
        currency: body.currency?.trim().toUpperCase() || "USD",
        notes: body.notes?.trim() || null,
        assigned_manager_id: assignedManagerId,
        pipeline_status_id: pipelineStatus.pipeline_status_id,
      },
    });

    if (pipelineStatus.status_code === "NEW_LEAD" || pipelineStatus.status_code === "LEAD") {
      await onLeadCreated(tx, {
        actorUserId: auth.session.user.user_id,
        leadId: body.lead_id ?? null,
        dealId: createdDeal.deal_id,
        managerUserId: assignedManagerId,
        leadNameOrTitle: createdDeal.title,
      });
    }

    return createdDeal;
  });

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "deal",
    entityId: deal.deal_id,
    actionKey: "deal.created",
    message: `Создана сделка ${deal.title}.`,
    metadata: {
      pipeline_status_code: pipelineStatus.status_code,
    },
  });

  return apiSuccess({
    deal_id: deal.deal_id,
  });
}
