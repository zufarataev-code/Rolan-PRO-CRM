import { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/**
 * Difficulty coefficients (rate directory). They multiply the whole deal:
 * client price and installer pay. Everyone who prices work may read them;
 * only the owner changes them.
 */
const READ_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;

async function listLevels() {
  const levels = await prisma.complexityLevel.findMany({ orderBy: { numeric_rank: "asc" } });
  return levels.map((level) => ({
    level_code: level.level_code,
    name_ru: level.name_ru,
    name_en: level.name_en,
    multiplier: Number(level.multiplier),
  }));
}

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, READ_ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Access denied.");
  return apiSuccess({ levels: await listLevels() });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Коэффициенты меняет только владелец.");

  const body = (await request.json().catch(() => null)) as { level_code?: string; multiplier?: number } | null;
  const multiplier = Number(body?.multiplier);
  if (!body?.level_code || !Number.isFinite(multiplier) || multiplier < 1 || multiplier > 5) {
    return apiError(400, "invalid_payload", "Коэффициент должен быть числом от 1 до 5.");
  }

  const updated = await prisma.complexityLevel.updateMany({
    where: { level_code: body.level_code },
    data: { multiplier: Math.round(multiplier * 100) / 100 },
  });
  if (updated.count !== 1) return apiError(404, "not_found", "Уровень сложности не найден.");
  return apiSuccess({ levels: await listLevels() });
}
