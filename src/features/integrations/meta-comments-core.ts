import { createHash } from "node:crypto";

export const FACEBOOK_COMMENT_SOURCE = "facebook_comment";
export const FACEBOOK_COMMENT_ACTION = "integration.facebook_comment.received";
export const FACEBOOK_COMMENT_STATUSES = [
  "pending_review",
  "escalated",
  "publishing",
  "replied",
  "dismissed",
] as const;
export const FACEBOOK_COMMENT_INTENTS = [
  "sales",
  "question",
  "complaint",
  "praise",
  "spam",
  "other",
] as const;

export type FacebookCommentStatus = (typeof FACEBOOK_COMMENT_STATUSES)[number];
export type FacebookCommentIntent = (typeof FACEBOOK_COMMENT_INTENTS)[number];

export class MetaCommentError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
    message = code,
  ) {
    super(message);
    this.name = "MetaCommentError";
  }
}

export type MetaCommentNotification = {
  page_id: string;
  comment_id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_id: string;
  author_name: string;
  message: string;
  commented_at: Date;
  permalink_url: string | null;
  metadata: {
    field: "feed";
    verb: "add";
    item: "comment";
  };
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MetaCommentError("invalid_payload");
  }
  return value as Record<string, unknown>;
}

export function metaObjectId(value: unknown, label = "id") {
  const candidate = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (
    typeof candidate !== "string" ||
    candidate.length > 191 ||
    !/^\d{1,32}(?:_\d{1,32}){0,4}$/.test(candidate)
  ) {
    throw new MetaCommentError("invalid_id", 400, `${label} is invalid.`);
  }
  return candidate;
}

function cleanText(value: unknown, maxLength: number, label: string, allowEmpty = false) {
  if (typeof value !== "string" || value.length > maxLength || value.includes("\u0000")) {
    throw new MetaCommentError("invalid_field", 400, `${label} is invalid.`);
  }
  const cleaned = value.replace(/\r\n/g, "\n").trim();
  if (!allowEmpty && !cleaned) {
    throw new MetaCommentError("invalid_field", 400, `${label} is required.`);
  }
  return cleaned;
}

function optionalFacebookUrl(value: unknown) {
  if (value == null || value === "") return null;
  const candidate = cleanText(value, 2_000, "permalink_url");
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && /(^|\.)facebook\.com$/i.test(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function commentDate(value: unknown, fallback: unknown) {
  const candidate = value ?? fallback;
  const date = typeof candidate === "number"
    ? new Date(candidate * 1_000)
    : typeof candidate === "string"
      ? new Date(candidate)
      : new Date(Number.NaN);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 5 * 60 * 1_000) {
    throw new MetaCommentError("invalid_created_time");
  }
  return date;
}

/**
 * Extract only new, public comments written by people. Page-authored replies,
 * edits, removals and unrelated Page webhook fields are deliberately ignored.
 */
export function metaCommentNotifications(input: unknown, configuredPageId: string) {
  const body = record(input);
  const pageId = metaObjectId(configuredPageId, "page_id");
  if (body.object !== "page" || !Array.isArray(body.entry)) {
    throw new MetaCommentError("invalid_payload");
  }

  const notifications: MetaCommentNotification[] = [];
  for (const item of body.entry) {
    const entry = record(item);
    if (metaObjectId(entry.id, "entry.id") !== pageId) continue;
    if (!Array.isArray(entry.changes)) throw new MetaCommentError("invalid_payload");

    for (const rawChange of entry.changes) {
      const change = record(rawChange);
      if (change.field !== "feed") continue;
      const value = record(change.value);
      if (value.item !== "comment" || value.verb !== "add") continue;

      const from = record(value.from);
      const authorId = metaObjectId(from.id, "from.id");
      if (authorId === pageId) continue;

      notifications.push({
        page_id: pageId,
        comment_id: metaObjectId(value.comment_id, "comment_id"),
        post_id: metaObjectId(value.post_id, "post_id"),
        parent_comment_id: value.parent_id == null ? null : metaObjectId(value.parent_id, "parent_id"),
        author_id: authorId,
        author_name: cleanText(from.name, 160, "from.name"),
        message: cleanText(value.message ?? "", 8_000, "message", true),
        commented_at: commentDate(value.created_time, entry.time),
        permalink_url: optionalFacebookUrl(value.permalink_url),
        metadata: { field: "feed", verb: "add", item: "comment" },
      });
    }
  }
  return notifications;
}

export function classifyFacebookComment(message: string): FacebookCommentIntent {
  const value = message.trim().toLowerCase();
  if (!value) return "other";

  const links = value.match(/https?:\/\//g)?.length ?? 0;
  if (
    links > 1 ||
    /\b(?:crypto|forex|binary options|investment return|buy followers|followers for sale|promo code)\b/i.test(value) ||
    /(.)\1{9,}/.test(value)
  ) return "spam";

  if (
    /\b(?:complaint|refund|scam|fraud|terrible|awful|damaged|damage|disappointed|never again|lawsuit)\b/i.test(value) ||
    /(?:жалоб|возврат|обман|ужасн|повредил|не работает|претензи)/i.test(value) ||
    /\b(?:queja|reembolso|estafa|dañado|terrible)\b/i.test(value)
  ) return "complaint";

  if (
    /\b(?:quote|estimate|price|cost|install|installation|interested|need|looking for|window film|smart film|solar film|security film|safety film|privacy film|frosted film)\b/i.test(value) ||
    /(?:цена|стоим|расч[её]т|смет|установ|монтаж|нужн|пл[её]нк|заинтерес)/i.test(value) ||
    /\b(?:precio|cotizaci[oó]n|costo|instalar|pel[ií]cula para ventana|interesad)\b/i.test(value)
  ) return "sales";

  if (
    /\b(?:thank you|thanks|great job|amazing|excellent|love it|beautiful work)\b/i.test(value) ||
    /(?:спасибо|отличн|круто|прекрасн|молодц)/i.test(value) ||
    /\b(?:gracias|excelente|buen trabajo|incre[ií]ble)\b/i.test(value)
  ) return "praise";

  if (
    value.includes("?") ||
    /^(?:how|what|when|where|why|can|could|do|does|is|are|will|would)\b/i.test(value) ||
    /^(?:как|что|когда|где|почему|можно|можете|есть ли)\b/i.test(value) ||
    /^(?:c[oó]mo|qu[eé]|cu[aá]ndo|d[oó]nde|por qu[eé]|pueden?)\b/i.test(value)
  ) return "question";

  return "other";
}

function commentLanguage(message: string) {
  if (/[А-Яа-яЁё]/.test(message)) return "ru";
  if (/[¿¡]|\b(?:hola|precio|gracias|ventana|película|cotización)\b/i.test(message)) return "es";
  return "en";
}

export function fallbackFacebookCommentDraft(
  message: string,
  intent: FacebookCommentIntent = classifyFacebookComment(message),
) {
  if (intent === "spam") return null;
  const language = commentLanguage(message);
  const drafts = {
    en: {
      sales: "Thanks for reaching out! We’d be happy to help with your window film project. Please send us a private message with your ZIP code and a few project details, and our team will guide you through the next step.",
      question: "Thanks for your question! Please send us a private message with a few details about your windows and what you’d like to improve, and our team will help you choose the right solution.",
      complaint: "Thank you for letting us know. We’re sorry to hear this and want to look into it right away. Please send us a private message with your name and project details so our manager can help.",
      praise: "Thank you! We really appreciate your kind words and support.",
      other: "Thanks for reaching out to Rolan PRO. Please send us a private message with a little more detail, and our team will be happy to help.",
    },
    ru: {
      sales: "Спасибо за обращение! Будем рады помочь с вашим проектом. Напишите нам, пожалуйста, в личные сообщения ZIP-код и краткие детали — команда подскажет следующий шаг.",
      question: "Спасибо за вопрос! Напишите нам, пожалуйста, в личные сообщения несколько деталей об окнах и вашей задаче — команда поможет подобрать решение.",
      complaint: "Спасибо, что сообщили. Нам жаль, что возникла такая ситуация, и мы хотим быстро разобраться. Напишите, пожалуйста, в личные сообщения ваше имя и детали проекта — менеджер поможет.",
      praise: "Спасибо большое! Нам очень приятно получить такой отзыв.",
      other: "Спасибо за обращение в Rolan PRO. Напишите нам, пожалуйста, в личные сообщения немного подробнее — команда будет рада помочь.",
    },
    es: {
      sales: "¡Gracias por contactarnos! Con gusto le ayudamos con su proyecto. Envíenos un mensaje privado con su código postal y algunos detalles, y nuestro equipo le indicará el siguiente paso.",
      question: "¡Gracias por su pregunta! Envíenos un mensaje privado con algunos detalles sobre sus ventanas y lo que desea mejorar, y nuestro equipo le ayudará a elegir la solución adecuada.",
      complaint: "Gracias por informarnos. Lamentamos lo ocurrido y queremos revisarlo de inmediato. Envíenos un mensaje privado con su nombre y los detalles del proyecto para que nuestro gerente pueda ayudarle.",
      praise: "¡Muchas gracias! Apreciamos mucho sus palabras y su apoyo.",
      other: "Gracias por contactar a Rolan PRO. Envíenos un mensaje privado con un poco más de información y con gusto le ayudaremos.",
    },
  } as const;
  const key = intent === "sales" || intent === "question" || intent === "complaint" || intent === "praise"
    ? intent
    : "other";
  return drafts[language][key];
}

export function facebookCommentPayloadHash(notification: MetaCommentNotification) {
  return createHash("sha256")
    .update(JSON.stringify({
      page_id: notification.page_id,
      comment_id: notification.comment_id,
      post_id: notification.post_id,
      parent_comment_id: notification.parent_comment_id,
      author_id: notification.author_id,
      author_name: notification.author_name,
      message: notification.message,
      commented_at: notification.commented_at.toISOString(),
    }))
    .digest("hex");
}

export function facebookCommentDueAt(intent: FacebookCommentIntent, from = new Date()) {
  const minutes = intent === "complaint" ? 15 : intent === "sales" ? 60 : intent === "question" ? 120 : 240;
  return new Date(from.getTime() + minutes * 60 * 1_000);
}

export function parseFacebookCommentAiResponse(text: string) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(clean);
  } catch {
    throw new MetaCommentError("invalid_ai_response", 502, "AI returned invalid JSON.");
  }
  const body = record(value);
  if (!FACEBOOK_COMMENT_INTENTS.includes(body.intent as FacebookCommentIntent)) {
    throw new MetaCommentError("invalid_ai_response", 502, "AI returned an invalid intent.");
  }
  const reply = cleanText(body.reply, 1_200, "reply");
  if (
    /\$\s*\d|\b(?:guaranteed?|definitely booked|appointment confirmed)\b/i.test(reply) ||
    /https?:\/\//i.test(reply) ||
    /\b(?:comment|post|share|write)\s+(?:your\s+)?(?:phone|email|address)\b/i.test(reply) ||
    /(?:напишите|оставьте|укажите)\s+(?:здесь\s+)?(?:телефон|почту|адрес)/i.test(reply)
  ) {
    throw new MetaCommentError("unsafe_ai_response", 502, "AI reply contains unsafe or unapproved public content.");
  }
  return { intent: body.intent as FacebookCommentIntent, reply };
}
