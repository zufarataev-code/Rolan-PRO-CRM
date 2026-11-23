import { NextRequest } from "next/server";

import { listSmsMessages, sendSms, sendWhatsApp } from "@/features/twilio/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "Authentication is required.");
  return apiSuccess({ messages: await listSmsMessages() });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "Authentication is required.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.to !== "string" || typeof body.body !== "string") {
    return apiError(400, "invalid_payload", "Phone and message text are required.");
  }
  try {
    const channel = body.channel === "whatsapp" ? "whatsapp" : "sms";
    const send = channel === "whatsapp" ? sendWhatsApp : sendSms;
    const result = await send({
      to: body.to,
      body: body.body,
      orderId: typeof body.orderId === "string" ? body.orderId : null,
      clientId: typeof body.clientId === "string" ? body.clientId : null,
      actorUserId: auth.session.user.user_id,
      ...(channel === "whatsapp" ? { media: whatsappMedia(body.media) } : {}),
    });
    return apiSuccess(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Twilio request failed.";
    return apiError(502, "twilio_send_failed", message);
  }
}

/** Files attached in the CRM: storage keys from /api/v1/files/upload-url. */
function whatsappMedia(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item.key === "string"))
    .map((item) => ({ key: String(item.key), contentType: String(item.contentType || "application/octet-stream") }))
    .slice(0, 10);
}
