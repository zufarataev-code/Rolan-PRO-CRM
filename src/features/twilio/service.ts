import { createHmac, timingSafeEqual } from "node:crypto";

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

async function twilioRequest(url: string, body: URLSearchParams, config = getTwilioConfig()) {
  const username = config.apiKeySid || config.accountSid;
  const password = config.apiKeySecret || config.authToken;
  if (!username || !password) throw new Error("Twilio server credentials are not configured.");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const result = await response.json().catch(() => null) as JsonObject | null;
  if (!response.ok) throw new Error(String(result?.message ?? `Twilio request failed (${response.status}).`));
  return result ?? {};
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
  const form = new URLSearchParams({ To: to, Body: body });
  if (config.messagingServiceSid) form.set("MessagingServiceSid", config.messagingServiceSid);
  else form.set("From", config.fromNumber);
  if (callbackUrl) form.set("StatusCallback", callbackUrl);
  const message = await twilioRequest(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    form,
    config,
  );
  const sid = String(message.sid ?? "");
  const status = String(message.status ?? "queued");
  if (!sid) throw new Error("Twilio did not return a message SID.");
  await prisma.twilioMessage.upsert({
    where: { message_sid: sid },
    create: {
      message_sid: sid,
      direction: "out",
      status,
      from_number: String(message.from ?? config.fromNumber),
      to_number: to,
      body,
      legacy_order_id: input.orderId ?? null,
      legacy_client_id: input.clientId ?? null,
      actor_user_id: input.actorUserId ?? null,
      sent_at: message.date_created ? new Date(String(message.date_created)) : new Date(),
    },
    update: { status },
  });
  return { sid, status, to };
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
  const result = await twilioRequest(
    `https://verify.twilio.com/v2/Services/${config.verifyServiceSid}/Verifications`,
    new URLSearchParams({ To: normalizePhone(toValue), Channel: "sms" }),
    config,
  );
  return { sid: String(result.sid ?? ""), status: String(result.status ?? "pending"), to: String(result.to ?? "") };
}

export async function checkVerification(toValue: string, code: string) {
  const config = getTwilioConfig();
  if (!config.verifyServiceSid) throw new Error("Twilio Verify is not configured.");
  const result = await twilioRequest(
    `https://verify.twilio.com/v2/Services/${config.verifyServiceSid}/VerificationCheck`,
    new URLSearchParams({ To: normalizePhone(toValue), Code: code.trim() }),
    config,
  );
  return { status: String(result.status ?? "pending"), valid: Boolean(result.valid), to: String(result.to ?? "") };
}

export function validateTwilioWebhook(request: Request, params: Record<string, string>) {
  const config = getTwilioConfig();
  if (!config.authToken || !config.publicBaseUrl) return false;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const path = new URL(request.url).pathname;
  const data = `${config.publicBaseUrl}${path}` + Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  const expected = createHmac("sha1", config.authToken).update(data).digest();
  const supplied = Buffer.from(signature, "base64");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
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
