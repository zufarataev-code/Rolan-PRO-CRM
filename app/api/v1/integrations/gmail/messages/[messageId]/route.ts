import { NextRequest } from "next/server";

import { markGmailMessageRead } from "@/features/gmail/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function PATCH(request: NextRequest, context: { params: Promise<{ messageId: string }> }) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Gmail update denied.");
  const { messageId } = await context.params;
  try {
    await markGmailMessageRead(messageId);
    return apiSuccess({ message_id: messageId, is_unread: false });
  } catch (error) {
    return apiError(502, "gmail_update_failed", error instanceof Error ? error.message : "Gmail update failed.");
  }
}
