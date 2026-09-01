import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/db";

const ZADARMA_API = "https://api.zadarma.com";

type ZadarmaPayload = Record<string, string>;

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

export function normalizeZadarmaPhone(value: unknown) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function getZadarmaConfig() {
  const apiKey = env("ZADARMA_API_KEY");
  const apiSecret = env("ZADARMA_API_SECRET");
  const publicBaseUrl = (env("ZADARMA_WEBHOOK_BASE_URL") || env("APP_URL")).replace(/\/$/, "");
  return {
    apiKey,
    apiSecret,
    publicBaseUrl,
    ready: Boolean(apiKey && apiSecret),
    webhookUrl: publicBaseUrl ? `${publicBaseUrl}/api/webhooks/zadarma` : "",
  };
}

function sortedParams(params: Record<string, string>) {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key).replace(/%20/g, "+")}=${encodeURIComponent(value).replace(/%20/g, "+")}`)
    .join("&");
}

export function createZadarmaApiSignature(method: string, params: Record<string, string>, secret: string) {
  const paramsString = sortedParams(params);
  const md5 = createHash("md5").update(paramsString).digest("hex");
  return createHmac("sha1", secret).update(`${method}${paramsString}${md5}`).digest("base64");
}

async function zadarmaRequest(method: string, params: Record<string, string> = {}) {
  const config = getZadarmaConfig();
  if (!config.ready) throw new Error("Zadarma credentials are not configured on the CRM server.");
  const query = sortedParams(params);
  const url = `${ZADARMA_API}${method}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `${config.apiKey}:${createZadarmaApiSignature(method, params, config.apiSecret)}` },
    cache: "no-store",
  });
  const result = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || result?.status === "error") {
    throw new Error(String(result?.message ?? result?.error ?? `Zadarma request failed (${response.status}).`));
  }
  return result ?? {};
}

export async function getZadarmaExtensions() {
  const result = await zadarmaRequest("/v1/pbx/internal/");
  return Array.isArray(result.numbers) ? result.numbers.map(String) : [];
}

export async function requestZadarmaCallback(input: { to: string; extension: string }) {
  const to = normalizeZadarmaPhone(input.to);
  const extension = input.extension.replace(/\D/g, "");
  if (!/^\+\d{8,15}$/.test(to)) throw new Error("Client phone must be in international format.");
  if (!/^\d{3}$/.test(extension)) throw new Error("A three-digit Zadarma PBX extension is required.");
  const extensions = await getZadarmaExtensions();
  if (!extensions.includes(extension)) throw new Error("This PBX extension does not belong to the connected Zadarma account.");
  const result = await zadarmaRequest("/v1/request/callback/", { from: extension, to, sip: extension });
  return { status: String(result.status ?? "success"), to, extension };
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function webhookSignatureSource(payload: ZadarmaPayload) {
  switch (payload.event) {
    case "NOTIFY_START":
    case "NOTIFY_END":
    case "NOTIFY_IVR":
      return `${payload.caller_id ?? ""}${payload.called_did ?? ""}${payload.call_start ?? ""}`;
    case "NOTIFY_ANSWER":
      return `${payload.caller_id ?? ""}${payload.destination ?? ""}${payload.call_start ?? ""}`;
    case "NOTIFY_OUT_START":
    case "NOTIFY_OUT_END":
      return `${payload.internal ?? ""}${payload.destination ?? ""}${payload.call_start ?? ""}`;
    case "NOTIFY_RECORD":
      return `${payload.pbx_call_id ?? ""}${payload.call_id_with_rec ?? ""}`;
    default:
      return "";
  }
}

export function validateZadarmaWebhook(payload: ZadarmaPayload, signature: string | null) {
  const secret = getZadarmaConfig().apiSecret;
  const source = webhookSignatureSource(payload);
  if (!secret || !source || !signature) return false;
  const expected = createHmac("sha1", secret).update(source).digest("base64");
  return safeEqual(expected, signature.trim());
}

function callTime(value: string | undefined) {
  if (!value) return new Date();
  if (/^\d{10,13}$/.test(value)) {
    const number = Number(value);
    return new Date(value.length === 10 ? number * 1000 : number);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function recordZadarmaWebhook(payload: ZadarmaPayload) {
  const event = payload.event || "";
  const pbxCallId = payload.pbx_call_id || payload.call_id_with_rec;
  if (!pbxCallId) return null;
  const direction = event.startsWith("NOTIFY_OUT") ? "outgoing" : "incoming";
  const phone = normalizeZadarmaPhone(direction === "outgoing" ? payload.destination : payload.caller_id);
  const internal = payload.internal?.replace(/\D/g, "") || null;
  const startedAt = callTime(payload.call_start);
  const duration = Math.max(0, Number.parseInt(payload.duration || "0", 10) || 0);
  const disposition = (payload.disposition || (event === "NOTIFY_ANSWER" ? "answered" : "")).trim().toLowerCase() || null;
  const isEnd = event === "NOTIFY_END" || event === "NOTIFY_OUT_END";
  const isAnswer = event === "NOTIFY_ANSWER";
  const isRecord = event === "NOTIFY_RECORD";
  return prisma.zadarmaCall.upsert({
    where: { pbx_call_id: pbxCallId },
    create: {
      pbx_call_id: pbxCallId,
      direction,
      phone_number: phone,
      internal_number: internal,
      called_did: normalizeZadarmaPhone(payload.called_did) || null,
      disposition,
      duration_seconds: duration,
      is_recorded: payload.is_recorded === "1" || isRecord,
      recording_id: payload.call_id_with_rec || null,
      started_at: startedAt,
      answered_at: isAnswer ? new Date() : null,
      ended_at: isEnd ? new Date() : null,
      raw_payload: payload,
    },
    update: {
      direction: isRecord ? undefined : direction,
      phone_number: phone || undefined,
      internal_number: internal || undefined,
      called_did: normalizeZadarmaPhone(payload.called_did) || undefined,
      disposition: disposition || undefined,
      duration_seconds: duration || undefined,
      is_recorded: payload.is_recorded === "1" || isRecord || undefined,
      recording_id: payload.call_id_with_rec || undefined,
      answered_at: isAnswer ? new Date() : undefined,
      ended_at: isEnd ? new Date() : undefined,
      raw_payload: payload,
    },
  });
}

export async function listZadarmaCalls(since?: Date) {
  return prisma.zadarmaCall.findMany({
    where: since ? { updated_at: { gt: since } } : undefined,
    orderBy: { started_at: "desc" },
    take: 100,
  });
}
