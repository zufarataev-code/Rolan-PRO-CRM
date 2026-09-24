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
  shouldRestartBookedConversation,
  shouldUseQualificationPrompt,
  startsNewBooking,
  type CrmSlot,
  type LeadData,
} from "./booking";
import { CrmRequestError, postToCrm, type CrmEnv } from "./crm";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const GRAPH_API = "https://graph.facebook.com/v21.0";
const HISTORY_LIMIT = 12;
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

const FALLBACK_PROMPT = `You are the AI sales consultant for Rolan PRO, a professional window-film company serving Southern California. Sound natural, warm, confident, and concise. Answer the customer's actual question first; then ask at most one useful follow-up question. Do not behave like a rigid form and do not force every message into booking. Your goal is to help the customer choose the right solution and, when they are ready, qualify them for a free on-site consultation. Never give a final price or promise an installation date. Escalate complaints, existing-order questions, genuine technical uncertainty, and requests for a person.`;

const ROLANPRO_KNOWLEDGE = `
Use this verified Rolan PRO knowledge when consulting customers:
- Rolan PRO installs Solar, Smart/Switchable, Safety/Security, and Decorative/Privacy films for homes and commercial properties in Southern California.
- Solar film helps reduce heat, glare, infrared energy, and UV exposure while improving comfort. The exact result depends on the selected film, glass construction, orientation, and sun exposure.
- MAGNITRONIC PRIME is Rolan PRO's own premium solar-control film series, not a third-party brand. Say "our Rolan PRO MAGNITRONIC PRIME film" when ownership is relevant. The models are SP-05, SP-15, SP-20, SP-35, SP-50, and SP-70; a lower number is darker and a higher number keeps more visible light.
- SP-05 is a specialty high-darkness option for commercial privacy, specialty retail, and controlled-light rooms; it is not the default for sun-exposed residential glass. SP-15 maximizes glare and visible-light reduction for offices, commercial glazing, and high-glare areas. SP-20 provides strong solar control for sun-exposed rooms, offices, and large glass areas. SP-35 is the everyday balanced option for homes, offices, and panoramic glass. SP-50 preserves more daylight for luxury homes, bright offices, and large windows. SP-70 is the clearest option for premium homes, showrooms/retail, and offices where minimal visual change is the priority.
- Product-card specifications are: SP-05 VLT 5.7%, IRR 95.6%, UVR 100%, TSER 93.3%; SP-15 VLT 14.0%, IRR 97.4%, UVR 99.9%, TSER 88.5%; SP-20 VLT 23.5%, IRR 96.2%, UVR 99.9%, TSER 83.2%; SP-35 VLT 35.5%, IRR 98.5%, UVR 99.8%, TSER 77.1%; SP-50 VLT 58.1%, IRR 99.2%, UVR 99.6%, TSER 68.2%; SP-70 VLT 68.0%, IRR 99.1%, UVR 99.2%, TSER 63.6%. Quote a figure only with its exact model and do not invent specifications.
- Never recommend a model from VLT or TSER alone. Verify glass type, coating, pane construction, size, orientation, shading, and edge condition. Standard clear or tempered glass still requires verification. IGU/double-pane, Low-E, tinted glass, and skylights require technical review. Laminated or damaged/chipped glass requires manufacturer approval and must not be installed until resolved.
- To recommend Solar film, learn the customer's main problem (heat, glare, UV/fading, daytime privacy, or appearance), residential/commercial property, glass type if known (single pane, dual pane, tempered, annealed, or Low-E), sun-facing side, and desired brightness. Explain the likely direction before asking for booking details.
- Daytime reflective privacy depends on the light balance and is not reliable privacy at night. For dependable nighttime privacy, discuss frosted/decorative or Smart film.
- Warranty answers must be framed as a summary of Rolan PRO's written Limited Warranty; the executed proposal, invoice, change orders, product-specific terms, and signed warranty control. Never promise that a claim is covered before Rolan PRO reviews it.
- Architectural Solar and Safety/Security Film: qualifying Rolan PRO-supplied and installed film at an eligible owner-occupied single-family home or owner-occupied condominium has a non-transferable Residential Limited Lifetime warranty while the original retail purchaser continuously owns that residence, unless Rolan PRO approves a transfer in writing. Commercial, rental, common-area, hospitality, institutional, leased, and other non-owner-occupied projects have the exact written project term, up to 12 years. Installation workmanship is 5 years unless Rolan PRO states a longer written term.
- For an approved architectural-film claim, the first 5 years generally include standard replacement material and standard installation labor for the affected area unless the project documents say otherwise. After year 5, qualifying Residential Limited Lifetime product coverage provides replacement film material; labor, removal/reinstallation, travel, lifts/scaffolding, permits, glazing, and extraordinary access may be chargeable. Replacement does not restart the original warranty.
- Architectural-film claims must be reported within 30 days after discovery and before coverage expires, with the project details and clear photos/video. The customer should not remove or materially alter the affected film before inspection unless immediate action is reasonably necessary for safety or to prevent additional damage.
- Smart Film: qualifying Smart Film supplied and installed by Rolan PRO has a total 12-year limited warranty when the project is paid in full and the system is used and maintained as required. Years 1-5 use the applicable manufacturer warranty; years 6-12 are Rolan PRO's own Extended Limited Warranty. Rolan PRO installation workmanship is 5 years. A Rolan PRO-supplied and installed power supply, transformer, controller, or related control device is covered for 5 years, subject to the written electrical and usage exclusions.
- The Smart Film warranty may transfer once to a subsequent owner of the same property when the system remains at the original installation location and proof is provided. Relocation of film or covered equipment voids coverage unless Rolan PRO approves it in writing. Smart warranty issues must be reported within a reasonable time after discovery and within the applicable warranty period.
- Common exclusions include glass breakage or seal failure, thermal stress, pre-existing glazing/building defects, impact or abuse, improper or abrasive cleaning, water intrusion, unauthorized alteration or third-party work that caused the problem, electrical surges or incompatible controls where applicable, normal aging and reasonable cosmetic/optical tolerances, and other causes outside Rolan PRO's control. Safety/Security Film reduces risk but is not a guarantee against break-in, injury, glass breakage, penetration, or loss. Solar Film does not guarantee a specific indoor temperature, utility savings, elimination of glare, or elimination of fading.
- Never call glass unbreakable. Safety film helps retain broken glass and can delay forced entry when correctly selected and anchored.
- Exact pricing depends on film, glass, dimensions, access, and installation complexity. Give a useful explanation, then offer a free measurement instead of inventing a quote.
`;

const CRM_BOOKING_PROMPT = `
The CRM, not you, owns appointment availability. Never invent, suggest, or confirm a date or time in reply. The application will add real CRM slots after you have collected the required details.
Collect these fields one at a time and return them in lead: name, phone, serviceType (Solar Film, Smart Film, Safety Film, or Decorative Film), propertyType, city, address when known, optional email, language, goal, and approximate windows.
Detect the language of the customer's latest message and store it in lead.language as a BCP-47 language tag such as en, es, ru, de, fr, ar, zh, or the appropriate tag for any other language. Always reply naturally in that language. If the customer switches languages, switch with them and update lead.language. Never transliterate when the customer's writing system is supported.
Use stage "qualifying" until those details are collected. Do not say that an appointment is booked; only the application may confirm that after PostgreSQL accepts the booking.
Consult before collecting: if the customer asks about a product, benefits, warranty, film choice, heat, glare, UV, privacy, or glass compatibility, answer that question first using the verified knowledge. Then ask only one relevant diagnostic or booking question. Never reply with a vague status such as "checking CRM"; the application itself will show real slots when ready.
Return only JSON with reply, stage, escalate, escalateReason, and lead. Use an empty string for unknown lead fields and never infer customer facts.`;

async function localizeOperationalMessage(env: Env, message: string, language?: string) {
  const languageTag = normalizeLanguage(language);
  if (languageTag === "en" || languageTag === "ru" || languageTag === "es") return message;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        system: "Translate the Rolan PRO customer-service message into the requested language. Preserve names, phone numbers, dates, times, SMS, CRM, and the meaning exactly. Return only the translated customer-facing message with no notes or quotation marks.",
        messages: [{
          role: "user",
          content: JSON.stringify({ target_language: languageTag, message }),
        }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic translation HTTP ${response.status}`);
    const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const translated = (data.content || [])
      .filter((item) => item.type === "text")
      .map((item) => item.text || "")
      .join("")
      .trim();
    return translated || message;
  } catch (error) {
    console.error("translation", { languageTag, error });
    return message;
  }
}

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

async function askAssistant(env: Env, history: HistoryMessage[], applicationStage: string) {
  const storedPrompt = await env.CHAT.get("sys_prompt");
  const stateInstruction = applicationStage === "booked"
    ? "Application state: this customer already has a confirmed booking. Answer follow-up questions normally. Do not start another booking or say you are checking CRM unless the customer explicitly asks for another appointment or address."
    : `Application state: ${applicationStage || "new"}.`;
  const startedAt = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system: `${storedPrompt || env.SYS_PROMPT || FALLBACK_PROMPT}\n\n${ROLANPRO_KNOWLEDGE}\n\n${CRM_BOOKING_PROMPT}\n\n${stateInstruction}`,
      messages: history,
    }),
  });
  console.log(JSON.stringify({
    event: "assistant_response",
    model: ANTHROPIC_MODEL,
    duration_ms: Date.now() - startedAt,
    status: response.status,
  }));
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

function qualificationPrompt(lead: LeadData, language?: string) {
  const normalized = normalizeLanguage(language);
  if (!lead.name?.trim()) {
    if (normalized === "ru") return "Как я могу к вам обращаться?";
    if (normalized === "es") return "¿Cómo se llama?";
    return "What is your name?";
  }
  if (!lead.phone?.trim()) {
    if (normalized === "ru") return "Напишите, пожалуйста, номер телефона для подтверждения записи.";
    if (normalized === "es") return "Indique su número de teléfono para confirmar la cita.";
    return "Please provide your phone number for the booking confirmation.";
  }
  if (!lead.serviceType?.trim()) {
    if (normalized === "ru") return "Какая услуга нужна: солнцезащитная, smart, защитная или декоративная плёнка?";
    if (normalized === "es") return "¿Qué servicio necesita: película solar, inteligente, de seguridad o decorativa?";
    return "Which service do you need: Solar, Smart, Safety, or Decorative Film?";
  }
  if (!lead.propertyType?.trim() && !lead.objectType?.trim()) {
    if (normalized === "ru") return "Понял услугу. Это жилой дом или коммерческий объект?";
    if (normalized === "es") return "Entendido. ¿Es una propiedad residencial o comercial?";
    return "Got it. Is this a residential or commercial property?";
  }
  if (!lead.address?.trim() && !lead.city?.trim()) {
    if (normalized === "ru") return "Напишите адрес объекта или хотя бы город — затем покажу свободное время.";
    if (normalized === "es") return "Indique la dirección o al menos la ciudad; después mostraré los horarios disponibles.";
    return "Please provide the property address or at least the city, then I'll show available times.";
  }
  return null;
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
    await sendMessage(env, event, await localizeOperationalMessage(env, noSlotsPrompt(state.lead.language), state.lead.language));
    return;
  }
  state.stage = "slot_offered";
  state.offeredSlots = slots;
  await persistState(env, key, state);
  await sendMessage(
    env,
    event,
    await localizeOperationalMessage(env, slotPrompt(state.lead.language), state.lead.language),
    slots,
    state.lead.language,
  );
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
    await sendMessage(
      env,
      event,
      await localizeOperationalMessage(
        env,
        bookedPrompt(slot, state.lead.language, smsSent),
        state.lead.language,
      ),
    );
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
  let alreadyBooked = state.stage === "booked";

  const selectedSlot = parseBookingPayload(event.quickReplyPayload);
  if (selectedSlot) {
    try {
      await bookSelectedSlot(env, event, key, state, selectedSlot);
    } catch (error) {
      console.error("crm_booking", error);
      await sendMessage(env, event, await localizeOperationalMessage(env, noSlotsPrompt(state.lead.language), state.lead.language));
    }
    return;
  }

  state.history.push({ role: "user", content: event.text });
  if (state.history.length > HISTORY_LIMIT) state.history = state.history.slice(-HISTORY_LIMIT);
  await graphPost(env, endpoint, { recipient: { id: event.senderId }, sender_action: "mark_seen" });
  await graphPost(env, endpoint, { recipient: { id: event.senderId }, sender_action: "typing_on" });

  let output: AssistantOutput;
  try {
    output = await askAssistant(env, state.history, state.stage);
  } catch (error) {
    console.error("assistant", error);
    await sendMessage(env, event, await localizeOperationalMessage(env, noSlotsPrompt(state.lead.language), state.lead.language));
    return;
  }

  state.history.push({ role: "assistant", content: JSON.stringify(output) });
  state.lead = normalizeLeadData(mergeLead(state.lead, output.lead), event.text);
  const attemptedBookingClaim = output.stage === "booked" || output.stage === "slot_offered";
  if (shouldRestartBookedConversation(attemptedBookingClaim, alreadyBooked)) {
    alreadyBooked = false;
    state.leadCapturedEventId = undefined;
    state.offeredSlots = [];
    state.escalated = false;
    console.log(JSON.stringify({ event: "repeat_booking_started", key }));
  }
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
    await sendMessage(env, event, await localizeOperationalMessage(env, noSlotsPrompt(state.lead.language), state.lead.language));
    return;
  }

  if (alreadyBooked && !state.escalated) state.stage = "booked";
  await persistState(env, key, state);
  const missingFieldPrompt = qualificationPrompt(state.lead, state.lead.language);
  const reply = shouldUseQualificationPrompt(attemptedBookingClaim, alreadyBooked) && missingFieldPrompt
    ? await localizeOperationalMessage(env, missingFieldPrompt, state.lead.language)
    : output.reply || await localizeOperationalMessage(
        env,
        noSlotsPrompt(state.lead.language),
        state.lead.language,
      );
  await sendMessage(env, event, reply);
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
