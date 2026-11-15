import { NextRequest } from "next/server";

import { deletePasskey } from "@/features/auth/passkeys";
import { PREVIEW_COOKIE } from "@/lib/auth/preview-edge";
import { getRealRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ passkeyId: string }>;
};

/** The employee turns Face ID off for one of their own devices. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await getRealRequestSession(request);
  if (!session) {
    return apiError(401, "unauthorized", "Authentication is required.");
  }
  if (request.cookies.get(PREVIEW_COOKIE)?.value) {
    return apiError(403, "preview_read_only", "Просмотр глазами сотрудника — только чтение.");
  }

  const { passkeyId } = await context.params;
  if (!UUID_PATTERN.test(passkeyId)) {
    return apiError(404, "not_found", "Устройство не найдено.");
  }

  // Scoped to the caller's own rows: another employee's key id is "not found".
  const removed = await deletePasskey(session.user.user_id, passkeyId);
  if (removed === 0) {
    return apiError(404, "not_found", "Устройство не найдено.");
  }

  return apiSuccess({ removed: true });
}
