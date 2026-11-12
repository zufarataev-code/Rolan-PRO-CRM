import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Plaud AI dictaphone → Zapier («Transcript & Summary Ready») → CRM.
 * Owner, 2026-11-12: «диктофон с ИИ слушает разговор с клиентом и заполняет проект».
 * Pure helpers only: payload normalisation, token check and project matching.
 */
export const PLAUD_ACTION = "integration.plaud.recording";
export const PLAUD_ENTITY = "plaud_recording";
export const PLAUD_MAX_TRANSCRIPT = 200_000;
export const PLAUD_MAX_SUMMARY = 20_000;

export class PlaudError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function text(value: unknown, max: number) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}
function firstText(body: JsonRecord, keys: string[], max: number) {
  for (const key of keys) {
    const value = text(body[key], max);
    if (value) return value;
  }
  return "";
}

export type PlaudRecording = {
  recording_key: string;
  title: string;
  recorded_at: string | null;
  received_at: string;
  duration_sec: number | null;
  summary: string;
  transcript: string;
};

/** Zapier lets the owner map fields freely, so a few common names are accepted. */
export function normalizePlaudPayload(input: unknown, now = new Date()): PlaudRecording {
  const body = record(input);
  const transcript = firstText(body, ["transcript", "transcription", "text"], PLAUD_MAX_TRANSCRIPT);
  const summary = firstText(body, ["summary", "ai_summary", "notes"], PLAUD_MAX_SUMMARY);
  if (!transcript && !summary) throw new PlaudError("empty_recording", "transcript or summary is required.");
  const title = firstText(body, ["title", "name", "file_name", "filename"], 300) || "Запись Plaud";
  const rawDate = firstText(body, ["recorded_at", "start_time", "created_at", "date"], 64);
  const parsed = rawDate ? new Date(/^\d{10,13}$/.test(rawDate) ? Number(rawDate.length === 10 ? Number(rawDate) * 1000 : rawDate) : rawDate) : null;
  const recordedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
  const rawDuration = Number(firstText(body, ["duration_sec", "duration", "length"], 20));
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration > 86_400 ? rawDuration / 1000 : rawDuration) : null;
  const explicitId = firstText(body, ["recording_id", "id", "file_id"], 191);
  const recordingKey = /^[A-Za-z0-9_.:-]{1,191}$/.test(explicitId)
    ? explicitId
    : "sha256:" + createHash("sha256").update(`${title}\n${recordedAt || ""}\n${transcript || summary}`).digest("hex").slice(0, 40);
  return {
    recording_key: recordingKey,
    title,
    recorded_at: recordedAt,
    received_at: now.toISOString(),
    duration_sec: duration,
    summary,
    transcript,
  };
}

/** Zapier sends `Authorization: Bearer <secret>` (or `x-plaud-token`). */
export function plaudTokenMatches(header: string | null, secret: string | undefined) {
  const expected = (secret || "").trim();
  if (expected.length < 24 || !header) return false;
  const received = header.replace(/^Bearer\s+/i, "").trim();
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const ORDER_NUMBER_PATTERN = /\b(?:R|WIZ)-[A-Za-z0-9]{2,}(?:-[A-Za-z0-9]+)*\b/gi;

function phoneDigits(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}
export function phonesInText(value: string) {
  return [...new Set((value.match(/\+?\d[\d\s().-]{8,}\d/g) || []).map(phoneDigits).filter(Boolean))];
}

export type PlaudMatch = { order_id: string; order_number: string; reason: "order_number" | "phone" | "measure_visit" };

const CLOSED_STATUSES = new Set(["completed", "review_received", "cancelled", "canceled", "lost"]);
const MINUTE = 60_000;

/**
 * Finds the project a recording belongs to, never guessing between two:
 * 1) project number in the Plaud title («R-261112-005 Иванов»);
 * 2) client phone in the title (one open project for that phone);
 * 3) the measurer pressed «Начал» on exactly one project around that time.
 */
export function matchPlaudRecording(rec: PlaudRecording, payload: JsonRecord, orders: JsonRecord[]): PlaudMatch | null {
  const haystack = `${rec.title}\n${rec.summary.slice(0, 2000)}`;
  const numbers = new Set((rec.title.match(ORDER_NUMBER_PATTERN) || []).map(item => item.toUpperCase()));
  if (numbers.size) {
    const byNumber = orders.filter(order => numbers.has(String(order.number || "").toUpperCase()));
    if (byNumber.length === 1) return { order_id: String(byNumber[0].id), order_number: String(byNumber[0].number || ""), reason: "order_number" };
  }

  const phones = phonesInText(haystack);
  if (phones.length) {
    const clients = Array.isArray(payload.clients) ? payload.clients.map(record) : [];
    const clientIds = new Set(clients.filter(client => [client.phone, client.phone2, client.mobile].some(phone => phones.includes(phoneDigits(phone)))).map(client => String(client.id)));
    const byPhone = orders.filter(order => clientIds.has(String(order.clientId)) && !CLOSED_STATUSES.has(String(order.status)));
    if (byPhone.length === 1) return { order_id: String(byPhone[0].id), order_number: String(byPhone[0].number || ""), reason: "phone" };
    if (byPhone.length > 1) return null;
  }

  // Without a recording time Plaud's «ready» moment is used, which can come hours later.
  const at = new Date(rec.recorded_at || rec.received_at).getTime();
  const afterSlack = rec.recorded_at ? 30 * MINUTE : 12 * 60 * MINUTE;
  const byVisit = orders.filter(order => {
    const visit = record(order.measureVisit);
    if (!visit.startedAt) return false;
    const start = new Date(String(visit.startedAt)).getTime();
    const end = visit.finishedAt ? new Date(String(visit.finishedAt)).getTime() : start + 4 * 60 * MINUTE;
    return Number.isFinite(start) && at >= start - 30 * MINUTE && at <= end + afterSlack;
  });
  if (byVisit.length === 1) return { order_id: String(byVisit[0].id), order_number: String(byVisit[0].number || ""), reason: "measure_visit" };
  return null;
}

/** E-mail route: subject = title; a text attachment is the transcript, the body its summary. */
export function plaudRecordingFromEmail(mail: { id: string; subject: string; sentAt: string; body: string; attachmentsText: string[] }) {
  const title = mail.subject.replace(/^\s*((fwd?|fw|re)\s*:\s*)+/i, "").trim() || "Запись Plaud";
  const attachment = mail.attachmentsText.join("\n\n").trim();
  return normalizePlaudPayload({
    recording_id: `gmail-${mail.id}`,
    title,
    summary: attachment && mail.body.trim() !== attachment ? mail.body : "",
    transcript: attachment || mail.body,
  }, new Date(mail.sentAt));
}
