import { NextRequest } from "next/server";

import { sendPrimaryGmail } from "@/features/gmail/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Gmail access denied.");
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  const orderId = request.nextUrl.searchParams.get("order_id")?.trim() || "";
  const direction = request.nextUrl.searchParams.get("direction")?.trim() || "";
  const messages = await prisma.gmailMessage.findMany({
    where: {
      ...(orderId ? { legacy_order_id: orderId } : {}),
      ...(direction === "inbound" || direction === "outbound" ? { direction } : {}),
      ...(query ? {
        OR: [
          { subject: { contains: query, mode: "insensitive" } },
          { sender_email: { contains: query, mode: "insensitive" } },
          { body_text: { contains: query, mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: { sent_at: "desc" },
    take: 200,
  });
  return apiSuccess({
    messages: messages.map(message => ({
      id: message.gmail_message_id,
      thread_id: message.gmail_thread_id,
      direction: message.direction,
      sender_email: message.sender_email,
      sender_name: message.sender_name,
      recipient_emails: message.recipient_emails,
      cc_emails: message.cc_emails,
      subject: message.subject,
      snippet: message.snippet,
      body: message.body_text,
      is_unread: message.is_unread,
      sent_at: message.sent_at,
      legacy_client_id: message.legacy_client_id,
      legacy_order_id: message.legacy_order_id,
      attachments: message.attachment_meta,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, ROLES);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Gmail send denied.");
  const body = await request.json().catch(() => null) as null | {
    to?: string;
    subject?: string;
    body?: string;
    thread_id?: string | null;
    in_reply_to?: string | null;
    legacy_order_id?: string | null;
    legacy_client_id?: string | null;
    purpose?: "client_correspondence" | "order_transactional" | "marketing" | "broadcast";
  };
  if (body?.purpose === "marketing" || body?.purpose === "broadcast") {
    return apiError(409, "wrong_email_channel", "Marketing and broadcast email must use the separate marketing email service, not the company Gmail account.");
  }
  const to = body?.to?.trim().toLowerCase() || "";
  const subject = body?.subject?.trim() || "";
  const messageBody = body?.body?.trim() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !messageBody) {
    return apiError(400, "invalid_payload", "Valid to, subject and body fields are required.");
  }
  try {
    const sent = await sendPrimaryGmail({
      to,
      subject,
      body: messageBody,
      threadId: body?.thread_id,
      inReplyTo: body?.in_reply_to,
      legacyOrderId: body?.legacy_order_id,
      legacyClientId: body?.legacy_client_id,
    });
    await prisma.activityLog.create({
      data: {
        actor_user_id: auth.session.user.user_id,
        entity_type: "gmail_message",
        entity_id: null,
        action_key: "gmail.message.sent",
        message: `Email sent to ${to}.`,
        metadata: { gmail_message_id: sent.id, legacy_order_id: body?.legacy_order_id || null },
      },
    });
    return apiSuccess({ message_id: sent.id, thread_id: sent.threadId });
  } catch (error) {
    return apiError(502, "gmail_send_failed", error instanceof Error ? error.message : "Gmail send failed.");
  }
}
