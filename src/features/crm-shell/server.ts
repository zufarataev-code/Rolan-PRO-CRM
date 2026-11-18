import type { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { runCrmEngine, type EngineRequest } from "@/features/crm-shell/engine";
// What this employee may see is decided in one place — the working CRM's state
// endpoint. The new interface reads through it and never around it.
import { GET as readLegacyState } from "../../../app/api/v1/legacy-crm/state/route";

/** The new interface opens for the office first; field roles keep their working screens. */
export const CRM_SHELL_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;

export async function crmShellResponse(request: NextRequest, model: EngineRequest) {
  const auth = await requireRequestSession(request, CRM_SHELL_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "CRM access denied.");
  const state = await readLegacyState(request);
  if (!state.ok) return state;
  const body = (await state.json()) as { data?: { payload?: Record<string, unknown> } };
  const payload = body.data?.payload;
  if (!payload) return apiError(404, "workspace_not_initialized", "CRM workspace is not initialized.");

  let result: Record<string, unknown>;
  try {
    result = runCrmEngine<Record<string, unknown>>(
      payload,
      {
        legacyUserIds: auth.session.user.legacy_user_ids ?? [],
        role: auth.session.roles.includes(ROLE_CODES.OWNER) ? "owner" : "manager",
        timeZone: request.nextUrl.searchParams.get("tz") ?? undefined,
      },
      model,
    );
  } catch (error) {
    console.error("[crm-shell] calculation failed", error);
    return apiError(500, "calculation_failed", "Не удалось посчитать данные. Откройте рабочую CRM.");
  }
  if (result.error === "no_card") return apiError(409, "no_card", "К вашему входу не привязана карточка сотрудника CRM.");
  if (result.error) return apiError(500, String(result.error), "Не удалось посчитать данные.");
  return apiSuccess(result);
}
