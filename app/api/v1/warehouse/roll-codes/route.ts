import { NextRequest } from "next/server";

import { reserveRollCode } from "@/features/warehouse/roll-codes";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Owner and managers receive rolls; each receipt reserves its code here. */
export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Roll codes are reserved by the owner or a manager.");
  }
  const body = (await request.json().catch(() => null)) as { date?: string; seen_max?: number } | null;
  return apiSuccess({ code: await reserveRollCode(body?.date ?? null, Math.floor(Number(body?.seen_max) || 0)) });
}
