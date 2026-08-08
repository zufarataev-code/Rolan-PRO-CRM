import { NextRequest, NextResponse } from "next/server";

import { getGmailAttachment } from "@/features/gmail/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError } from "@/lib/http/api-response";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ messageId: string; attachmentId: string }> },
) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Gmail attachment access denied.");
  const { messageId, attachmentId } = await context.params;
  try {
    const file = await getGmailAttachment(messageId, attachmentId);
    const safeName = file.name.replace(/[\r\n"\\/]/g, "_");
    return new NextResponse(file.data, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiError(404, "gmail_attachment_not_found", error instanceof Error ? error.message : "Gmail attachment was not found.");
  }
}
