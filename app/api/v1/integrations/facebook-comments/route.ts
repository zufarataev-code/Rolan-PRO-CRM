import { NextRequest } from "next/server";

import {
  listFacebookComments,
  metaCommentConfig,
  metaCommentManagerScope,
} from "@/features/integrations/meta-comments";
import { MANAGER_ROLES } from "@/features/sales/api";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, MANAGER_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Facebook comment access denied.");
  }
  const config = metaCommentConfig();
  const limitValue = Number(request.nextUrl.searchParams.get("limit") || "50");
  const items = await listFacebookComments({
    managerId: metaCommentManagerScope(auth.session),
    status: request.nextUrl.searchParams.get("status"),
    limit: Number.isFinite(limitValue) ? limitValue : 50,
  });
  return apiSuccess({
    items,
    integration: {
      webhook_configured: config.webhookConfigured,
      publishing_configured: config.publishingConfigured,
      page_id: config.pageId || null,
      webhook_url: `${request.nextUrl.origin}/api/webhooks/meta-lead-ads`,
      subscribed_field: "feed",
      mode: "manager_approval",
    },
  });
}
