import { NextRequest } from "next/server";

import { recordInstallerLocation } from "@/features/installer-operations/service";
import { INSTALLER_ONLY_ROLES } from "@/features/projects/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, INSTALLER_ONLY_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Доступ запрещён.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.latitude !== "number" || typeof body.longitude !== "number") {
    return apiError(400, "invalid_location", "Координаты не переданы.");
  }

  const result = await recordInstallerLocation(auth.session, {
    latitude: body.latitude,
    longitude: body.longitude,
    accuracy_meters: typeof body.accuracy_meters === "number" ? body.accuracy_meters : null,
    captured_at: typeof body.captured_at === "string" ? body.captured_at : null,
  });
  if (result === "invalid_location") return apiError(400, result, "Некорректная геолокация.");
  if (!result) return apiError(409, "tracking_inactive", "Отслеживание сейчас выключено.");
  return apiSuccess({ recorded: true });
}
