import { NextRequest } from "next/server";

import {
  createLeadFromFacebookComment,
  metaCommentManagerScope,
} from "@/features/integrations/meta-comments";
import { metaCommentErrorResponse } from "@/features/integrations/meta-comments-http";
import { MANAGER_ROLES } from "@/features/sales/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type RouteContext = { params: Promise<{ commentId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Facebook lead creation denied.");
  }
  try {
    const { commentId } = await context.params;
    return apiSuccess(await createLeadFromFacebookComment({
      commentId,
      managerId: metaCommentManagerScope(auth.session),
      actorUserId: auth.session.user.user_id,
    }));
  } catch (error) {
    return metaCommentErrorResponse(error);
  }
}
