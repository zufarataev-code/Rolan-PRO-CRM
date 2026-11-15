import { NextRequest } from "next/server";

import { deleteAllPasskeys } from "@/features/auth/passkeys";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ userId: string }>;
};

/** The owner turns Face ID off on every device of one employee (lost phone, dismissal). */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Team access denied.");
  }

  const { userId } = await context.params;
  if (!UUID_PATTERN.test(userId)) {
    return apiError(404, "not_found", "Сотрудник не найден.");
  }

  return apiSuccess({ removed: await deleteAllPasskeys(userId) });
}
