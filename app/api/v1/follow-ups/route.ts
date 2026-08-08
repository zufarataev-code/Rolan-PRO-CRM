import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES, getManagerScope } from "@/features/sales/api";
import { listFollowUps } from "@/features/sales/service";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Follow-ups access denied.");
  }

  const managerId = getManagerScope(request, auth.session);
  const data = await listFollowUps(managerId);

  return apiSuccess({
    items: data,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Follow-up creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        lead_id?: string | null;
        deal_id?: string | null;
        type_key?: string;
        status?: string;
        due_at?: string;
        notes?: string;
        outcome?: string;
        assigned_to?: string | null;
      }
    | null;

  if (!body?.type_key || !body?.due_at) {
    return apiError(400, "invalid_payload", "type_key and due_at are required.");
  }

  const followUp = await prisma.followUp.create({
    data: {
      lead_id: body.lead_id ?? null,
      deal_id: body.deal_id ?? null,
      type_key: body.type_key,
      status: body.status ?? "scheduled",
      due_at: new Date(body.due_at),
      notes: body.notes?.trim() || null,
      outcome: body.outcome?.trim() || null,
      assigned_to: body.assigned_to ?? auth.session.user.user_id,
      created_by: auth.session.user.user_id,
    },
  });

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "follow_up",
    entityId: followUp.follow_up_id,
    actionKey: "follow_up.created",
    message: `Создан follow up ${followUp.type_key}.`,
    metadata: {
      due_at: followUp.due_at.toISOString(),
    },
  });

  return apiSuccess({
    follow_up_id: followUp.follow_up_id,
  });
}
