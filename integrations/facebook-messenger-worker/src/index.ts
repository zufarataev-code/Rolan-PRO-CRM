import {
  bookingPayload,
  buildBusinessWindows,
  crmLeadPayload,
  formatSlot,
  leadReadyForBooking,
  leadReadyForCrm,
  normalizeLeadData,
  normalizeLanguage,
  parseBookingPayload,
  startsNewBooking,
  type CrmSlot,
  type LeadData,
} from "./booking";
import { CrmRequestError, postToCrm, type CrmEnv } from "./crm";

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const GRAPH_API = "https://graph.facebook.com/v21.0";
const HISTORY_LIMIT = 20;
const CONVERSATION_TTL_SECONDS = 30 * 24 * 60 * 60;

type KvNamespace = {
  get(key: string, options: { type: "json" }): Promise<ConversationState | null>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

type Env = CrmEnv & {
  ANTHROPIC_API_KEY: string;
  PAGE_TOKEN: string;
  PAGE_ID: string;
  IG_ID?: string;
  VERIFY_TOKEN: string;
  SYS_PROMPT?: string;
  CHAT: KvNamespace;
};

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

type MessengerEvent = {
  platform: "messenger" | "instagram";
  senderId: string;
  eventId: string;
  text: string;
  quickReplyPayload?: string;
};

type HistoryMessage = { role: "user" | "assistant"; content: string };

type ConversationState = {
  history: HistoryMessage[];
  lead: LeadData;
  stage: string;
  escalated: boolean;
  leadCapturedEventId?: string;
  offeredSlots?: CrmSlot[];
  updated?: string;
};

type AssistantOutput = {
  reply: string;
  stage: string;
  escalate: boolean;
  escalateReason?: string;
  lead?: LeadData;
};

type CrmBookingResult = {
  lead_id: string;
  consultation_id: string;
  sms_confirmation?: {
    status: "sent" | "already_sent" | "failed";
    sid?: string;
    to?: string;
    error?: string;
  };
};

const FALLBACK_PROMPT = `You are Danil, the AI assistant for Rolan PRO, a window-film company in Southern California. Reply briefly in the customer's language and ask one question at a time. Your goal is to qualify the customer for a free on-site consultation. Never give a final price or promise an installation date. Escalate complaints, existing-order questions, technical uncertainty, and requests for a person.`;

const CRM_BOOKING_PROMPT = `
The CRM, not you, owns appointment availability. Never invent, suggest, or confirm a date or time in reply. The application will add real CRM slots after you have collected the required details.
Collect these fields one at a time and return them in lead: name, phone, serviceType (Solar Film, Smart Film, Safety Film, or Decorative Film), propertyType, city, address when known, optional email, language, goal, and approximate windows.
Use stage "qualifying" until those details are collected. Do not say that an appointment is booked; only the application may confirm that after PostgreSQL accepts the booking.
Return only JSON with reply, stage, escalate, escalateReason, and lead. Use an empty string for unknown lead fields and never infer customer facts.`;

function messengerEvents(body: unknown): MessengerEvent[] {
  if (!body || typeof body !== "object") return [];
  const source = body as { object?: string; entry?: Array<{ messaging?: Array<Record<string, unknown>> }> };
  const platform = source.object === "instagram" ? "instagram" : "messenger";
  const events: MessengerEvent[] = [];

  for (const entry of source.entry || []) {
    for (const raw of entry.messaging || []) {
      const message = raw.message as {
        mid?: string;
        text?: string;
        is_echo?: boolean;
        quick_reply?: { payload?: string };
      } | undefined;
      const sender = raw.sender as { id?: string } | undefined;
      if (!message?.text || message.is_echo || !sender?.id) continue;
      events.push({
        platform,
        senderId: sender.id,
        eventId: message.mid || `${sender.id}:${Date.now()}`,
        text: message.text.trim(),
        quickReplyPayload: message.quick_reply?.payload,
      });
    }
  }
  return events;
}

async function graphPost(env: Env, path: string, payload: unknown) {
  const response = await fetch(`${GRAPH_API}/${path}?access_token=${env.PAGE_TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) console.error("graph", path, await response.text());
  return response;
}

function messagingEndpoint(env: Env, platform: MessengerEvent["platform"]) {
  if (platform === "instagram" && env.IG_ID) return `${env.IG_ID}/messages`;
  if (env.PAGE_ID) return `${env.PAGE_ID}/messages`;
  return "me/messages";
}

async function sendMessage(
  env: Env,
  event: MessengerEvent,
  text: string,
  slots: CrmSlot[] = [],
  language?: string,
) {
  const message: Record<string, unknown> = { text };
  if (slots.length) {
    message.quick_replies = slots.slice(0, 5).map((slot) => ({
      content_type: "text",
      title: formatSlot(slot, language).slice(0, 20),
      payload: bookingPayload(slot),
    }));
  }
  return graphPost(env, messagingEndpoint(env, event.platform), {
    recipient: { id: event.senderId },
    message,
  });
}

async function askAssistant(env: Env, history: HistoryMessage[]) {
  const storedPrompt = await env.CHAT.get("sys_prompt");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1_000,
      system: `${storedPrompt || env.SYS_PROMPT || FALLBACK_PROMPT}\n\n${CRM_BOOKING_PROMPT}`,
      messages: history,
    }),
  });
  if (!response.ok) throw new Error(`Anthropic HTTP ${response.status}`);
  const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
  const raw = (data.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Assistant returned invalid JSON.");
  return JSON.parse(raw.slice(start, end + 1)) as AssistantOutput;
}

function mergeLead(current: LeadData, update?: LeadData) {
  const next = { ...current };
  for (const [key, value] of Object.entries(update || {})) {
    if (typeof value === "string" && value.trim()) {
      (next as Record<string, string>)[key] = value.trim();
    }
  }
  return next;
}

function slotPrompt(language?: string) {
  const normalized = normalizeLanguage(language);
  if (normalized === "ru") return "Вот ближайшее свободное время. Выберите удобный вариант:";
  if (normalized === "es") return "Estos son los horarios disponibles más próximos. Elija uno:";
  return "Here are the next available consultation times. Choose one:";
}

function bookedPrompt(slot: CrmSlot, language?: string, smsSent = false) {
  const time = formatSlot(slot, language);
  const normalized = normalizeLanguage(language);
  if (normalized === "ru") {
    return smsSent
      ? `Готово — бесплатный замер записан на ${time}. Подтверждение отправлено SMS на указанный номер.`
      : `Готово — бесплатный замер записан на ${time}. SMS сейчас не отправилось, поэтому сохраните это подтверждение в Messenger.`;
  }
  if (normalized === "es") {
    return smsSent
      ? `Listo: la visita gratuita está reservada para ${time}. Enviamos la confirmación por SMS al número indicado.`
      : `Listo: la visita gratuita está reservada para ${time}. El SMS no pudo enviarse ahora; conserve esta confirmación en Messenger.`;
  }
  return smsSent
    ? `You're booked for a free consultation on ${time}. We sent an SMS confirmation to the phone number you provided.`
    : `You're booked for a free consultation on ${time}. The SMS could not be sent right now, so please keep this Messenger confirmation.`;
}

function noSlotsPrompt(language?: string) {
  const normalized = normalizeLanguage(language);
  if (normalized === "ru") return "Свободное время сейчас не загрузилось. Передаю заявку менеджеру — он свяжется с вами.";
  if (normalized === "es") return "No pude cargar un horario disponible. Pasaré su solicitud al gerente para que se comunique con usted.";
  return "I couldn't load an available time. I'll pass your request to the manager for a follow-up.";
}

function qualificationPrompt(language?: string) {
  const normalized = normalizeLanguage(language);
  if (normalized === "ru") return "Запись ещё не создана. Уточните услугу, тип объекта и адрес — после этого я покажу реальные свободные слоты из CRM.";
  if (normalized === "es") return "La cita todavía no está creada. Confirme el servicio, el tipo de propiedad y la dirección; después mostraré horarios reales del CRM.";
  return "The appointment is not booked yet. Confirm the service, property type, and address, then I'll show real CRM availability.";
}

async function availableSlots(env: Env) {
  const result = await postToCrm<{ slots: CrmSlot[] }>(
    env,
    "/api/integrations/facebook-messenger/slots",
    {
      windows: buildBusinessWindows(),
      duration_minutes: 60,
      step_minutes: 60,
      limit: 5,
    },
  );
  return result.slots;
}

async function persistState(env: Env, key: string, state: ConversationState) {
  state.updated = new Date().toISOString();
  await env.CHAT.put(key, JSON.stringify(state), { expirationTtl: CONVERSATION_TTL_SECONDS });
}

async function offerSlots(env: Env, event: MessengerEvent, key: string, state: ConversationState) {
  const slots = await availableSlots(env);
  if (!slots.length) {
    state.stage = "escalated";
    state.escalated = true;
    await persistState(env, key, state);
    await sendMessage(env, event, noSlotsPrompt(state.lead.language));
    return;
  }
  state.stage = "slot_offered";
  state.offeredSlots = slots;
  await persistState(env, key, state);
  await sendMessage(env, event, slotPrompt(state.lead.language), slots, state.lead.language);
}

async function bookSelectedSlot(
  env: Env,
  event: MessengerEvent,
  key: string,
  state: ConversationState,
  slot: CrmSlot,
) {
  const offered = state.offeredSlots?.some(
    (candidate) => candidate.start_at === slot.start_at && candidate.end_at === slot.end_at,
  );
  if (!offered || !leadReadyForBooking(state.lead)) {
    await offerSlots(env, event, key, state);
    return;
  }

  try {
    const booking = await postToCrm<CrmBookingResult>(
      env,
      "/api/integrations/facebook-messenger/bookings",
      {
        ...crmLeadPayload(
          state.lead,
          `${event.eventId}:booking`,
          event.senderId,
          env.PAGE_ID,
        ),
        scheduled_start_at: slot.start_at,
        scheduled_end_at: slot.end_at,
      },
    );
    const smsStatus = booking.sms_confirmation?.status;
    const smsSent = smsStatus === "sent" || smsStatus === "already_sent";
    state.stage = "booked";
    state.offeredSlots = [];
    await persistState(env, key, state);
    console.log(JSON.stringify({
      event: "crm_booking_confirmed",
      leadId: booking.lead_id,
      consultationId: booking.consultation_id,
      smsStatus: smsStatus || "unknown",
    }));
    await sendMessage(env, event, bookedPrompt(slot, state.lead.language, smsSent));
  } catch (error) {
    if (error instanceof CrmRequestError && error.code === "slot_unavailable") {
      await offerSlots(env, event, key, state);
      return;
    }
    throw error;
  }
}

async function handleEvent(env: Env, event: MessengerEvent) {
  const key = `${event.platform}:${event.senderId}`;
  const endpoint = messagingEndpoint(env, event.platform);
  let state: ConversationState = {
    history: [],
    lead: {},
    stage: "new",
    escalated: false,
  };
  try {
    state = (await env.CHAT.get(key, { type: "json" })) || state;
  } catch (error) {
    console.error("kv_read", error);
  }
  state.lead = normalizeLeadData(state.lead || {});
  if (state.stage === "booked" && startsNewBooking(event.text)) {
    state = {
      history: [],
      lead: {
        name: state.lead.name,
        phone: state.lead.phone,
        language: state.lead.language,
      },
      stage: "qualifying",
      escalated: false,
    };
  }
  const alreadyBooked = state.stage === "booked";

  const selectedSlot = parseBookingPayload(event.quickReplyPayload);
  if (selectedSlot) {
    try {
      await bookSelectedSlot(env, event, key, state, selectedSlot);
    } catch (error) {
      console.error("crm_booking", error);
      await sendMessage(env, event, noSlotsPrompt(state.lead.language));
    }
    return;
  }

  state.history.push({ role: "user", content: event.text });
  if (state.history.length > HISTORY_LIMIT) state.history = state.history.slice(-HISTORY_LIMIT);
  await graphPost(env, endpoint, { recipient: { id: event.senderId }, sender_action: "mark_seen" });
  await graphPost(env, endpoint, { recipient: { id: event.senderId }, sender_action: "typing_on" });

  let output: AssistantOutput;
  try {
    output = await askAssistant(env, state.history);
  } catch (error) {
    console.error("assistant", error);
    await sendMessage(env, event, noSlotsPrompt(state.lead.language));
    return;
  }

  state.history.push({ role: "assistant", content: JSON.stringify(output) });
  state.lead = normalizeLeadData(mergeLead(state.lead, output.lead));
  const attemptedBookingClaim = output.stage === "booked" || output.stage === "slot_offered";
  state.stage = output.escalate
    ? "escalated"
    : attemptedBookingClaim
      ? "qualifying"
      : output.stage || "qualifying";
  state.escalated = Boolean(output.escalate);

  try {
    if (leadReadyForCrm(state.lead) && !state.leadCapturedEventId) {
      const captureEventId = `${event.eventId}:lead`;
      await postToCrm(
        env,
        "/api/integrations/facebook-messenger/leads",
        crmLeadPayload(state.lead, captureEventId, event.senderId, env.PAGE_ID),
      );
      state.leadCapturedEventId = captureEventId;
    }

    if (!alreadyBooked && !state.escalated && leadReadyForBooking(state.lead)) {
      await offerSlots(env, event, key, state);
      return;
    }
  } catch (error) {
    console.error("crm", error);
    state.stage = "escalated";
    state.escalated = true;
    await persistState(env, key, state);
    await sendMessage(env, event, noSlotsPrompt(state.lead.language));
    return;
  }

  if (alreadyBooked && !state.escalated) state.stage = "booked";
  await persistState(env, key, state);
  await sendMessage(
    env,
    event,
    attemptedBookingClaim
      ? qualificationPrompt(state.lead.language)
      : output.reply || noSlotsPrompt(state.lead.language),
  );
  console.log(JSON.stringify({ key, stage: state.stage, leadCaptured: Boolean(state.leadCapturedEventId) }));
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContextLike) {
    const url = new URL(request.url);
    if (request.method === "GET") {
      if (url.searchParams.get("hub.verify_token") === env.VERIFY_TOKEN) {
        return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
      }
      return new Response("forbidden", { status: 403 });
    }
    if (request.method !== "POST") return new Response("ok", { status: 200 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("bad", { status: 400 });
    }
    for (const event of messengerEvents(body)) context.waitUntil(handleEvent(env, event));
    return new Response("EVENT_RECEIVED", { status: 200 });
  },
};
