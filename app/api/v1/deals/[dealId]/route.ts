import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES } from "@/features/sales/api";
import { getDealCardById } from "@/features/sales/service";

type RouteContext = {
  params: Promise<{
    dealId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Deal card access denied.");
  }

  const { dealId } = await context.params;
  const data = await getDealCardById(dealId);

  if (!data) {
    return apiError(404, "not_found", "Deal was not found.");
  }

  return apiSuccess({
    deal: data,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Deal update denied.");
  }

  const { dealId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        estimated_value?: number;
        currency?: string;
        notes?: string | null;
        client_id?: string | null;
        lead_id?: string | null;
        assigned_manager_id?: string | null;
      }
    | null;

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const updated = await prisma.deal.update({
    where: {
      deal_id: dealId,
    },
    data: {
      title: body.title?.trim(),
      estimated_value: body.estimated_value,
      currency: body.currency?.trim().toUpperCase(),
      notes: body.notes?.trim() || body.notes || undefined,
      client_id: body.client_id !== undefined ? body.client_id : undefined,
      lead_id: body.lead_id !== undefined ? body.lead_id : undefined,
      assigned_manager_id: body.assigned_manager_id !== undefined ? body.assigned_manager_id : undefined,
    },
  }).catch(() => null);

  if (!updated) {
    return apiError(404, "not_found", "Deal was not found.");
  }

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "deal",
    entityId: updated.deal_id,
    actionKey: "deal.updated",
    message: `Сделка ${updated.title} обновлена.`,
  });

  return apiSuccess({
    deal_id: updated.deal_id,
  });
}
