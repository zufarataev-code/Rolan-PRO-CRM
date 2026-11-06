import { NextRequest } from "next/server";

import {
  metaCommentManagerScope,
  updateFacebookComment,
} from "@/features/integrations/meta-comments";
import { metaCommentErrorResponse } from "@/features/integrations/meta-comments-http";
import { MANAGER_ROLES } from "@/features/sales/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = { params: Promise<{ commentId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Facebook comment update denied.");
  }
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action !== "dismiss" && body?.action !== "reopen") {
    return apiError(400, "invalid_action", "Action must be dismiss or reopen.");
  }
  try {
    const { commentId } = await context.params;
    return apiSuccess(await updateFacebookComment({
      commentId,
      managerId: metaCommentManagerScope(auth.session),
      actorUserId: auth.session.user.user_id,
      action: body.action,
    }));
  } catch (error) {
    return metaCommentErrorResponse(error);
  }
}
