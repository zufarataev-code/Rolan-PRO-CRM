import twilio from "twilio";

import { prisma } from "@/lib/db";

type JsonObject = Record<string, unknown>;

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(asObject(item))) : [];
}

function normalizePhone(value: unknown) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function getTwilioConfig() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const apiKeySid = env("TWILIO_API_KEY_SID");
  const apiKeySecret = env("TWILIO_API_KEY_SECRET");
  const fromNumber = normalizePhone(env("TWILIO_FROM_NUMBER"));
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  const verifyServiceSid = env("TWILIO_VERIFY_SERVICE_SID");
  const publicBaseUrl = (env("TWILIO_WEBHOOK_BASE_URL") || env("APP_URL")).replace(/\/$/, "");
  return {
    accountSid, authToken, apiKeySid, apiKeySecret, fromNumber,
    messagingServiceSid, verifyServiceSid, publicBaseUrl,
    ready: Boolean(accountSid && (authToken || (apiKeySid && apiKeySecret)) && (fromNumber || messagingServiceSid)),
  };
}

export function getTwilioPublicStatus() {
  const config = getTwilioConfig();
  return {
    connected: config.ready,
    sender: config.fromNumber || (config.messagingServiceSid ? "Messaging Service" : ""),
    inboundWebhook: config.publicBaseUrl ? `${config.publicBaseUrl}/api/webhooks/twilio/inbound` : "",
    verifyEnabled: Boolean(config.verifyServiceSid),
  };
}

function getClient(config = getTwilioConfig()) {
  if (!config.accountSid) throw new Error("TWILIO_ACCOUNT_SID is not configured.");
  if (config.apiKeySid && config.apiKeySecret) {
    return twilio(config.apiKeySid, config.apiKeySecret, { accountSid: config.accountSid });
  }
  if (config.authToken) return twilio(config.accountSid, config.authToken);
  throw new Error("Twilio server credentials are not configured.");
}

export async function sendSms(input: {
  to: string;
  body: string;
  orderId?: string | null;
  clientId?: string | null;
  actorUserId?: string | null;
}) {
  const config = getTwilioConfig();
  if (!config.ready) throw new Error("Twilio SMS is not configured on the CRM server.");
  const to = normalizePhone(input.to);
  const body = input.body.trim();
  if (!/^\+\d{8,15}$/.test(to)) throw new Error("Client phone must be in international format.");
  if (!body || body.length > 1600) throw new Error("SMS text must contain 1–1600 characters.");

  const callbackUrl = config.publicBaseUrl ? `${config.publicBaseUrl}/api/webhooks/twilio/status` : undefined;
  const message = await getClient(config).messages.create({
    to,
    body,
    ...(config.messagingServiceSid ? { messagingServiceSid: config.messagingServiceSid } : { from: config.fromNumber }),
    ...(callbackUrl ? { statusCallback: callbackUrl } : {}),
  });
  await prisma.twilioMessage.upsert({
    where: { message_sid: message.sid },
    create: {
      message_sid: message.sid,
      direction: "out",
      status: message.status || "queued",
      from_number: message.from || config.fromNumber,
      to_number: to,
      body,
      legacy_order_id: input.orderId ?? null,
      legacy_client_id: input.clientId ?? null,
      actor_user_id: input.actorUserId ?? null,
      sent_at: message.dateCreated || new Date(),
    },
    update: { status: message.status || "queued" },
  });
  return { sid: message.sid, status: message.status || "queued", to };
}

export async function listSmsMessages() {
  const messages = await prisma.twilioMessage.findMany({ orderBy: { sent_at: "desc" }, take: 500 });
  return messages.map((message) => ({
    id: `msg_${message.message_sid}`,
    at: message.sent_at.toISOString(),
    by: message.actor_user_id,
    orderId: message.legacy_order_id,
    clientId: message.legacy_client_id,
    channel: "sms",
    direction: message.direction,
    status: message.status,
    body: message.body,
    detail: message.error_code ? `Twilio ${message.status}, code ${message.error_code}` : `Twilio: ${message.status}`,
    meta: { twilioSid: message.message_sid, from: message.from_number, to: message.to_number },
  }));
}

export async function startVerification(toValue: string) {
  const config = getTwilioConfig();
  if (!config.verifyServiceSid) throw new Error("Twilio Verify is not configured.");
  const result = await getClient(config).verify.v2.services(config.verifyServiceSid)
    .verifications.create({ to: normalizePhone(toValue), channel: "sms" });
  return { sid: result.sid, status: result.status, to: result.to };
}

export async function checkVerification(toValue: string, code: string) {
  const config = getTwilioConfig();
  if (!config.verifyServiceSid) throw new Error("Twilio Verify is not configured.");
  const result = await getClient(config).verify.v2.services(config.verifyServiceSid)
    .verificationChecks.create({ to: normalizePhone(toValue), code: code.trim() });
  return { status: result.status, valid: result.valid, to: result.to };
}

export function validateTwilioWebhook(request: Request, params: Record<string, string>) {
  const config = getTwilioConfig();
  if (!config.authToken || !config.publicBaseUrl) return false;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const path = new URL(request.url).pathname;
  return twilio.validateRequest(config.authToken, signature, `${config.publicBaseUrl}${path}`, params);
}

async function resolveLegacyReferences(phone: string) {
  const workspace = await prisma.legacyWorkspace.findUnique({ where: { workspace_id: "primary" }, select: { payload: true } });
  const payload = asObject(workspace?.payload) ?? {};
  const client = asArray(payload.clients).find((item) => normalizePhone(item.phone) === phone) ?? null;
  const clientId = client ? String(client.id ?? "") || null : null;
  const order = asArray(payload.orders)
    .filter((item) => String(item.clientId ?? "") === clientId)
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0] ?? null;
  return { clientId, orderId: order ? String(order.id ?? "") || null : null };
}

export async function recordIncomingSms(params: Record<string, string>) {
  const from = normalizePhone(params.From);
  const to = normalizePhone(params.To);
  const sid = String(params.MessageSid ?? params.SmsSid ?? "");
  if (!sid) throw new Error("Twilio message SID is missing.");
  const refs = await resolveLegacyReferences(from);
  await prisma.twilioMessage.upsert({
    where: { message_sid: sid },
    create: {
      message_sid: sid,
      direction: "in",
      status: "received",
      from_number: from,
      to_number: to,
      body: String(params.Body ?? "").slice(0, 1600),
      legacy_client_id: refs.clientId,
      legacy_order_id: refs.orderId,
      raw_payload: { numMedia: Number(params.NumMedia ?? 0) },
      sent_at: new Date(),
    },
    update: { status: "received" },
  });
}

export async function updateMessageStatus(params: Record<string, string>) {
  const sid = String(params.MessageSid ?? params.SmsSid ?? "");
  const status = String(params.MessageStatus ?? params.SmsStatus ?? "");
  if (!sid || !status) return;
  await prisma.twilioMessage.updateMany({
    where: { message_sid: sid },
    data: { status, error_code: params.ErrorCode || null },
  });
}
