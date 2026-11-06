import { NextRequest } from "next/server";

import {
  metaCommentManagerScope,
  publishFacebookCommentReply,
} from "@/features/integrations/meta-comments";
import { metaCommentErrorResponse } from "@/features/integrations/meta-comments-http";
import { MANAGER_ROLES } from "@/features/sales/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = { params: Promise<{ commentId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Facebook reply publishing denied.");
  }
  const body = await request.json().catch(() => null) as { message?: unknown } | null;
  if (typeof body?.message !== "string") {
    return apiError(400, "invalid_reply", "Reply text is required.");
  }
  try {
    const { commentId } = await context.params;
    return apiSuccess(await publishFacebookCommentReply({
      commentId,
      managerId: metaCommentManagerScope(auth.session),
      actorUserId: auth.session.user.user_id,
      message: body.message,
    }));
  } catch (error) {
    return metaCommentErrorResponse(error);
  }
}
