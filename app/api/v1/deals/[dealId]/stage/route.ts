import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MANAGER_ROLES, getManagerScope } from "@/features/sales/api";
import { moveDealStage } from "@/features/sales/service";

type RouteContext = {
  params: Promise<{
    dealId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Stage transition denied.");
  }

  const { dealId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        next_status_code?: string;
        next_action?: {
          type_key?: string;
          due_at?: string;
          notes?: string | null;
        } | null;
      }
    | null;

  if (!body?.next_status_code) {
    return apiError(400, "invalid_payload", "next_status_code is required.");
  }

  const nextAction = body.next_action
    ? {
        typeKey: body.next_action.type_key?.trim() ?? "",
        dueAt: new Date(body.next_action.due_at ?? ""),
        notes: body.next_action.notes,
      }
    : null;

  if (nextAction && (!nextAction.typeKey || Number.isNaN(nextAction.dueAt.getTime()))) {
    return apiError(400, "invalid_next_action", "Укажите тип и дату следующего действия.");
  }

  const result = await moveDealStage({
    dealId,
    nextStatusCode: body.next_status_code,
    actorUserId: auth.session.user.user_id,
    managerScopeId: getManagerScope(request, auth.session),
    nextAction,
  });

  if (!result.ok) {
    if (result.code === "not_found") {
      return apiError(404, result.code, "Сделка не найдена.");
    }
    if (result.code === "forbidden") {
      return apiError(403, result.code, "Менеджер может менять только свои сделки.");
    }
    if (result.code === "status_not_found") {
      return apiError(404, result.code, "Этап воронки не найден.");
    }
    if (result.code === "next_action_required") {
      return apiError(422, result.code, "Для активной сделки обязательно назначьте следующее действие.");
    }
    if (result.code === "invalid_next_action_date") {
      return apiError(422, result.code, "Дата следующего действия должна быть в будущем.");
    }

    return apiError(409, result.code, "Такой переход между этапами не разрешён.", {
      allowed: "allowed" in result ? result.allowed : [],
    });
  }

  return apiSuccess({
    deal: result.deal,
    allowed_next: result.allowed_next,
  });
}
