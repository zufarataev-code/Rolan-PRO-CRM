import { NextRequest } from "next/server";

import { INSTALLER_ONLY_ROLES } from "@/features/projects/api";
import {
  getInstallerOperationsDashboard,
  startInstallerWorkSession,
  stopInstallerWorkSession,
} from "@/features/installer-operations/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, INSTALLER_ONLY_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Доступ запрещён.");
  return apiSuccess(await getInstallerOperationsDashboard(auth.session));
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, INSTALLER_ONLY_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Доступ запрещён.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload = body ?? {};
  const action = payload.action;

  if (action === "start") {
    const result = await startInstallerWorkSession(auth.session, {
      installer_job_id: typeof payload.installer_job_id === "string" ? payload.installer_job_id : null,
      start_odometer_miles: typeof payload.start_odometer_miles === "number" ? payload.start_odometer_miles : null,
      tracking_enabled: payload.tracking_enabled === true,
    });
    if (result === "already_active") return apiError(409, result, "Смена уже начата.");
    if (result === "job_not_found") return apiError(404, result, "Монтаж не найден.");
    return apiSuccess({ session: result });
  }

  if (action === "stop") {
    const result = await stopInstallerWorkSession(auth.session, {
      end_odometer_miles: typeof payload.end_odometer_miles === "number" ? payload.end_odometer_miles : null,
      miles_driven: typeof payload.miles_driven === "number" ? payload.miles_driven : null,
      notes: typeof payload.notes === "string" ? payload.notes : null,
    });
    if (!result) return apiError(404, "no_active_session", "Активная смена не найдена.");
    return apiSuccess({ session: result });
  }

  return apiError(400, "invalid_action", "Укажите действие start или stop.");
}
