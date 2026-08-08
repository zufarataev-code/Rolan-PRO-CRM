import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { logSalesActivity } from "@/features/sales/activity";
import { MANAGER_ROLES } from "@/features/sales/api";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Task update denied.");
  }

  const { taskId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, string | null> | null;

  if (!body) {
    return apiError(400, "invalid_payload", "Request body is required.");
  }

  const task = await prisma.task.update({
    where: {
      task_id: taskId,
    },
    data: {
      title: body.title?.trim() || undefined,
      description: body.description?.trim() || body.description || undefined,
      status: body.status || undefined,
      priority: body.priority || undefined,
      due_at: body.due_at ? new Date(body.due_at) : undefined,
      assigned_to: body.assigned_to !== undefined ? body.assigned_to : undefined,
      completed_at: body.status === "done" ? new Date() : undefined,
    },
  }).catch(() => null);

  if (!task) {
    return apiError(404, "not_found", "Task was not found.");
  }

  await logSalesActivity({
    actorUserId: auth.session.user.user_id,
    entityType: "task",
    entityId: task.task_id,
    actionKey: "task.updated",
    message: `Задача ${task.title} обновлена.`,
  });

  return apiSuccess({
    task_id: task.task_id,
  });
}
