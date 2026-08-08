import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES, getManagerScope } from "@/features/sales/api";
import { listTasks } from "@/features/sales/service";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Tasks access denied.");
  }

  const managerId = getManagerScope(request, auth.session);
  const data = await listTasks(managerId);

  return apiSuccess({
    items: data,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Task creation denied.");
  }

  const body = (await request.json().catch(() => null)) as
    | {
        lead_id?: string | null;
        deal_id?: string | null;
        entity_type?: string | null;
        entity_id?: string | null;
        title?: string;
        description?: string;
        status?: string;
        priority?: string;
        due_at?: string | null;
        assigned_to?: string | null;
      }
    | null;

  if (!body?.title?.trim()) {
    return apiError(400, "invalid_payload", "Task title is required.");
  }

  const task = await prisma.task.create({
    data: {
      lead_id: body.lead_id ?? null,
      deal_id: body.deal_id ?? null,
      entity_type: body.entity_type ?? null,
      entity_id: body.entity_id ?? null,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: body.status ?? "open",
      priority: body.priority ?? "normal",
      due_at: body.due_at ? new Date(body.due_at) : null,
      assigned_to: body.assigned_to ?? auth.session.user.user_id,
      created_by: auth.session.user.user_id,
    },
  });

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "task",
    entityId: task.task_id,
    actionKey: "task.created",
    message: `Создана задача ${task.title}.`,
  });

  return apiSuccess({
    task_id: task.task_id,
  });
}
