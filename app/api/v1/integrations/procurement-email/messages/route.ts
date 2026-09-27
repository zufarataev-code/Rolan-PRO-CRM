import { NextRequest } from "next/server";

import { sendProcurementEmail } from "@/features/email/procurement";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Procurement email access denied.");
  const body = await request.json().catch(() => null) as null | {
    purchase_request_id?: string;
    to?: string;
    subject?: string;
    body?: string;
  };
  const purchaseRequestId = body?.purchase_request_id?.trim() || "";
  const to = body?.to?.trim().toLowerCase() || "";
  const subject = body?.subject?.trim() || "";
  const messageBody = body?.body?.trim() || "";
  if (!/^[a-zA-Z0-9_-]{3,100}$/.test(purchaseRequestId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !messageBody) {
    return apiError(400, "invalid_payload", "Purchase request id, valid recipient, subject, and body are required.");
  }
  try {
    const sent = await sendProcurementEmail({
      to,
      subject,
      text: messageBody,
      idempotencyKey: `procurement-${purchaseRequestId}`,
    });
    await prisma.activityLog.create({
      data: {
        actor_user_id: auth.session.user.user_id,
        entity_type: "purchase_request",
        entity_id: null,
        action_key: "procurement.request.sent",
        message: `Purchase request sent to ${to}.`,
        metadata: { purchase_request_id: purchaseRequestId, provider: "resend", provider_message_id: sent.id },
      },
    });
    return apiSuccess({ message_id: sent.id });
  } catch (error) {
    return apiError(502, "procurement_email_failed", error instanceof Error ? error.message : "Procurement email failed.");
  }
}
