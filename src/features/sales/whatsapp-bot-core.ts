// Pure helpers for the WhatsApp sales bot (no database, no network) so the
// conversation rules can be unit-tested.

import {
  CONVERSATION_RULES,
  FALLBACK_PROMPT,
  ROLANPRO_KNOWLEDGE,
} from "../../../integrations/facebook-messenger-worker/src/knowledge";

export const WHATSAPP_BOT_KIND = "whatsapp_bot";
export const WHATSAPP_LEAD_SOURCE = "whatsapp";
export const WHATSAPP_HUMAN_TAKEOVER_MS = 12 * 60 * 60 * 1000;
export const WHATSAPP_HISTORY_LIMIT = 16;

export type WhatsAppHistoryItem = {
  direction: "in" | "out";
  body: string;
  sentAt: Date;
  kind?: string | null;
  actorUserId?: string | null;
};

export type WhatsAppBotOutput = {
  reply: string;
  handoff: boolean;
  handoffReason: string;
  name: string;
  serviceType: string;
  city: string;
  preferredTime: string;
};

const WHATSAPP_CHANNEL_PROMPT = `
CHANNEL: WhatsApp. The customer wrote to Rolan PRO's business WhatsApp, usually from a Facebook or Instagram ad.
- Plain WhatsApp text only: no markdown headings, no tables, at most one emoji. Keep every reply to 1-3 short sentences.
- Reply in the language of the customer's latest message.
- In your first reply, briefly thank them for contacting Rolan PRO before helping.
- Goal: understand the problem (heat, glare, privacy, security, decor, smart glass), give a useful direction, then offer a FREE on-site measurement. Collect only what is missing, one question at a time: name, home or business, city or address, and a convenient day and time window. The phone number is already known from WhatsApp — never ask for it.
- You cannot see the schedule. Never confirm a specific appointment; say a manager will confirm the exact time shortly.
- Hand off to a manager (handoff=true) when the customer gave a convenient time, asks for a person or a call, has a complaint or an existing order, or asks something you cannot answer from the verified knowledge.
Return ONLY JSON: {"reply": string, "handoff": boolean, "handoffReason": string, "name": string, "serviceType": string, "city": string, "preferredTime": string}. Use "" for unknown fields and never invent customer facts.`;

export function buildWhatsAppSystemPrompt() {
  return [FALLBACK_PROMPT, ROLANPRO_KNOWLEDGE, CONVERSATION_RULES, WHATSAPP_CHANNEL_PROMPT].join("\n");
}

/**
 * A manager has taken over when someone other than the bot wrote to the
 * customer recently. The bot then stays silent so it never talks over a person.
 */
export function humanTookOver(history: WhatsAppHistoryItem[], now: Date) {
  return history.some(
    (item) =>
      item.direction === "out" &&
      item.kind !== WHATSAPP_BOT_KIND &&
      now.getTime() - item.sentAt.getTime() < WHATSAPP_HUMAN_TAKEOVER_MS,
  );
}

/** Chronological history → Anthropic messages (alternating, starting with the customer). */
export function toAnthropicMessages(history: WhatsAppHistoryItem[]) {
  const ordered = [...history]
    .filter((item) => item.body.trim())
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
    .slice(-WHATSAPP_HISTORY_LIMIT);
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const item of ordered) {
    const role = item.direction === "in" ? "user" : "assistant";
    const content = item.body.trim().slice(0, 2000);
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n${content}`;
    else messages.push({ role, content });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  return messages;
}

function text(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseWhatsAppBotOutput(raw: string): WhatsAppBotOutput | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const value = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      const reply = text(value.reply, 1200);
      if (reply) {
        return {
          reply,
          handoff: value.handoff === true,
          handoffReason: text(value.handoffReason),
          name: text(value.name, 120),
          serviceType: text(value.serviceType, 60),
          city: text(value.city, 160),
          preferredTime: text(value.preferredTime, 160),
        };
      }
    } catch {
      // fall through to plain text
    }
  }
  const plain = raw.trim();
  if (!plain || plain.startsWith("{")) return null;
  return {
    reply: plain.slice(0, 1200),
    handoff: false,
    handoffReason: "",
    name: "",
    serviceType: "",
    city: "",
    preferredTime: "",
  };
}

export function whatsappLeadName(profileName: string | null | undefined, phone: string) {
  const name = (profileName ?? "").trim().slice(0, 150);
  return name || `WhatsApp ${phone}`;
}
