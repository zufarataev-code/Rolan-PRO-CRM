import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES } from "@/features/sales/api";

type RouteContext = {
  params: Promise<{
    followUpId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Follow-up update denied.");
  }

  const { followUpId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, string | null> | null;

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const followUp = await prisma.followUp.update({
    where: {
      follow_up_id: followUpId,
    },
    data: {
      type_key: body.type_key || undefined,
      status: body.status || undefined,
      due_at: body.due_at ? new Date(body.due_at) : undefined,
      notes: body.notes?.trim() || body.notes || undefined,
      outcome: body.outcome?.trim() || body.outcome || undefined,
      assigned_to: body.assigned_to !== undefined ? body.assigned_to : undefined,
      completed_at: body.status === "completed" ? new Date() : undefined,
    },
  }).catch(() => null);

  if (!followUp) {
    return apiError(404, "not_found", "Follow-up was not found.");
  }

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "follow_up",
    entityId: followUp.follow_up_id,
    actionKey: "follow_up.updated",
    message: `Follow up ${followUp.type_key} обновлен.`,
  });

  return apiSuccess({
    follow_up_id: followUp.follow_up_id,
  });
}
