import {
  bookingPayload,
  buildBusinessWindows,
  crmLeadPayload,
  formatSlot,
  isBusinessHours,
  knownLeadFacts,
  leadReadyForBooking,
  looksLikeCallbackTime,
  parseLeadFormMessage,
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
const BURST_WINDOW_MS = 2500;
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
- Rolan PRO's own clear SAF protective-film range is SAF 50, SAF 100, SAF 200, SAF 300, SAF 350, and SAF 400. Product-card specifications are: SAF 50 - 2 mil, 1 ply, tensile strength 19,000 psi, elongation at break MD/TD 97/46%, PLI break strength 40; SAF 100 - 4 mil, 1 ply, 19,000 psi, 84/94%, PLI 74; SAF 200 - 8 mil, 2 ply, 19,250 psi, 125/101%, PLI 157; SAF 300 - 12 mil, 3 ply, 23,700 psi, 131/74%, PLI 300; SAF 350 - 14 mil, 3 ply, 24,700 psi, 131/80%, PLI 320; SAF 400 - 16 mil, 4 ply, 24,800 psi, 131/80%, PLI 350. All six cards state VLT 98%, UV rejection 98%, and IR rejection 18%. Quote figures only with the exact model and call them product-card values, not a whole-window performance guarantee.
- Position SAF 50 as the thin, nearly invisible basic shard-retention option; SAF 100 as heavier-duty protection; SAF 200 for higher-risk security projects; and SAF 300/350/400 as progressively thicker high-strength options that may increase forced-entry delay when the complete glazing system is correctly designed. Choose only after learning the customer's risk goal, glass type and thickness, frame construction, pane size, access conditions, and whether a tested attachment/anchoring system is required.
- Never call the glass unbreakable, shatterproof, burglar-proof, bulletproof, blast-proof, hurricane-proof, or injury-proof. Film primarily retains fragments and may delay forced entry. Security performance depends on the complete system: film, glass, frame, edge attachment or anchoring, installation, and site conditions. Do not make a ballistic, blast, hurricane, forced-entry, or code/standard performance claim unless the executed project documents identify the tested system, applicable standard, required configuration, and supplied performance level.
- Rolan PRO's decorative supplier catalogs include static-cling privacy patterns AT-001 through AT-028, AT-036 through AT-043, AT-049 through AT-052, and vertically textured AT-101 through AT-104. The 3D laser-rainbow static patterns are AT-029 through AT-035 and AT-044 through AT-048. These are catalog design codes, not verified performance ratings or confirmation of current stock.
- Reeded/fluted catalog options are AT-C001 clear 25 mm; AT-C002 clear, grey, tea, or black 5 mm; AT-C004B clear 13 mm; AT-C004 clear, tea, or grey 15 mm; AT-C005 clear 9 mm; AT-C006 clear 6 mm; AT-C008 clear 12 mm; plus textured AT-S50 and prismatic AT-055B. The supplier lists 1.52 x 30 m and 1.52 x 50 m rolls, with the reed line running along the roll length. Confirm current availability, exact color, roll size, and sample appearance before promising a model.
- Decorative-film consultation should first identify the desired privacy level, clear/frosted/colored look, geometric/floral/rainbow/reeded style, residential or commercial space, glass dimensions, viewing distance, lighting on both sides, and whether removable static cling or a professionally installed permanent solution is required. Decorative film obscures detail and changes appearance; do not promise complete privacy in every lighting condition, solar-control performance, safety/security performance, or Smart Film switching unless the selected product explicitly provides it.
- Exact pricing depends on film, glass, dimensions, access, and installation complexity. Give a useful explanation, then offer a free measurement instead of inventing a quote.
`;

const CRM_BOOKING_PROMPT = `
The CRM, not you, owns appointment availability. Never invent, suggest, or confirm a date or time in reply. The application will add real CRM slots after you have collected the required details.
Collect these fields one at a time and return them in lead: name, phone, serviceType (Solar Film, Smart Film, Safety Film, or Decorative Film), propertyType, city, address when known, optional email, language, goal, and approximate windows.
Detect the language of the customer's latest message and store it in lead.language as a BCP-47 language tag such as en, es, ru, de, fr, ar, zh, or the appropriate tag for any other language. Always reply naturally in that language. If the customer switches languages, switch with them and update lead.language. Never transliterate when the customer's writing system is supported.
Use stage "qualifying" until those details are collected. Do not say that an appointment is booked; only the application may confirm that after PostgreSQL accepts the booking.
Consult before collecting: if the customer asks about a product, benefits, warranty, film choice, heat, glare, UV, privacy, or glass compatibility, answer that question first using the verified knowledge. Then ask only one relevant diagnostic or booking question. Never reply with a vague status such as "checking CRM"; the application itself will show real slots when ready.
Return only JSON with reply, stage, escalate, escalateReason, and lead. Use an empty string for unknown lead fields and never infer customer facts.`;


const CONVERSATION_RULES = `
CONVERSATION RULES — these override anything above when they conflict:
- The customer already agreed in the lead form that a virtual assistant replies. Do not announce or repeat that you are an AI or a bot. If the customer directly asks whether they are talking to a bot, a person, or AI, answer honestly in one short sentence (you are the Rolan PRO virtual assistant and a manager follows up personally), then continue helping. Never claim to be a human and never invent a personal name; when needed, sign as "the Rolan PRO team".
- Read the collected facts block below before every reply. Never ask for a fact that is already known, and never repeat a question you already asked in this conversation. If an earlier answer was vague, acknowledge what the customer said and ask a narrower follow-up instead of the same question.
- Acknowledge the customer's specific situation in your own words before the next question (for example: old film peeling on both sides means removal plus new film).
- When the job involves replacing or removing old film, damaged film, or unusual glass, ask the customer to send 2-3 photos of the windows here in the chat — it helps prepare the visit.
- If the form ZIP and the area the customer names do not match, do not ask for the city again; ask once for the property's street address.
- Aim to get the customer to a booked free on-site measurement within 2-3 messages. Ask only what is still missing, one question per message, and keep each reply to 1-3 short sentences.
- Never mention internal systems, errors, loading problems, calendars, or the CRM to the customer.`;

async function localizeOperationalMessage(
  env: Env,
  message: string,
  language?: string,
  englishOnlySource = false,
) {
  const languageTag = normalizeLanguage(language);
  if (languageTag === "en") return message;
  if (!englishOnlySource && (languageTag === "ru" || languageTag === "es")) return message;

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
        attachments?: Array<{ type?: string }>;
      } | undefined;
      const sender = raw.sender as { id?: string } | undefined;
      if (!message || message.is_echo || !sender?.id) continue;
      const images = (message.attachments || []).filter((item) => item.type === "image").length;
      const photoNote = images
        ? `[The customer sent ${images} photo${images > 1 ? "s" : ""} of the windows in this chat.]`
        : "";
      const text = [message.text?.trim(), photoNote].filter(Boolean).join("\n");
      if (!text) continue;
      events.push({
        platform,
        senderId: sender.id,
        eventId: message.mid || `${sender.id}:${Date.now()}`,
        text,
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

async function askAssistant(
  env: Env,
  history: HistoryMessage[],
  applicationStage: string,
  lead: LeadData,
) {
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
      system: `${storedPrompt || env.SYS_PROMPT || FALLBACK_PROMPT}\n\n${ROLANPRO_KNOWLEDGE}\n\n${CRM_BOOKING_PROMPT}\n\n${CONVERSATION_RULES}\n\n${knownLeadFacts(lead)}\n\n${stateInstruction}`,
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

function firstName(lead: LeadData) {
  return lead.name?.trim().split(/\s+/)[0] || "";
}

function callbackQuestion(lead: LeadData) {
  const name = firstName(lead);
  const greeting = name ? `Thank you, ${name}!` : "Thank you!";
  const hours = isBusinessHours()
    ? "Our manager will reach out personally to set up the visit."
    : "Our office is closed right now, but your request is saved and our manager will reach out personally to set up the visit.";
  if (!lead.phone?.trim()) {
    return `${greeting} ${hours} What is the best phone number and time to call you?`;
  }
  return `${greeting} ${hours} What time works best for a quick call to ${lead.phone.trim()}?`;
}

function callbackConfirmed(lead: LeadData) {
  const name = firstName(lead);
  return `${name ? `Got it, ${name}` : "Got it"} — our manager will call you ${lead.callbackTime?.trim() || "soon"}. If anything changes, just message us here.`;
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

/**
 * Graceful fallback when real slots cannot be offered (CRM unreachable, no free
 * time, assistant failure). The customer never sees a technical error: we save
 * what we have and ask when a manager may call.
 */
async function askForCallback(
  env: Env,
  event: MessengerEvent,
  key: string,
  state: ConversationState,
  reason: string,
) {
  console.log(JSON.stringify({ event: "callback_requested", key, reason }));
  state.stage = "callback_requested";
  state.escalated = false;
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
  } catch (error) {
    console.error("crm_callback_capture", error);
  }
  const text = await localizeOperationalMessage(env, callbackQuestion(state.lead), state.lead.language, true);
  state.history.push({ role: "assistant", content: JSON.stringify({ reply: text, stage: state.stage }) });
  await persistState(env, key, state);
  await sendMessage(env, event, text);
}

async function confirmCallback(
  env: Env,
  event: MessengerEvent,
  key: string,
  state: ConversationState,
) {
  state.lead.callbackTime = event.text.slice(0, 200);
  state.stage = "callback_set";
  state.escalated = false;
  state.history.push({ role: "user", content: event.text });
  if (leadReadyForCrm(state.lead)) {
    try {
      await postToCrm(
        env,
        "/api/integrations/facebook-messenger/leads",
        {
          ...crmLeadPayload(state.lead, `${event.eventId}:callback`, event.senderId, env.PAGE_ID),
          callback_time: state.lead.callbackTime,
        },
      );
    } catch (error) {
      console.error("crm_callback_time", error);
    }
  }
  const text = await localizeOperationalMessage(env, callbackConfirmed(state.lead), state.lead.language, true);
  state.history.push({ role: "assistant", content: JSON.stringify({ reply: text, stage: state.stage }) });
  await persistState(env, key, state);
  await sendMessage(env, event, text);
}

async function offerSlots(
  env: Env,
  event: MessengerEvent,
  key: string,
  state: ConversationState,
  leadIn?: string,
) {
  let slots: CrmSlot[] = [];
  try {
    slots = await availableSlots(env);
  } catch (error) {
    console.error("crm_slots", error);
  }
  if (!slots.length) {
    await askForCallback(env, event, key, state, "no_slots");
    return;
  }
  state.stage = "slot_offered";
  state.offeredSlots = slots;
  await persistState(env, key, state);
  // Keep the assistant's acknowledgment of what the customer said, but drop it
  // if it is another question — the slot buttons are the next step.
  if (leadIn?.trim() && !leadIn.trim().endsWith("?")) await sendMessage(env, event, leadIn.trim());
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
    const followUp = state.lead.address?.trim()
      ? "If you can, send 2-3 photos of the windows here — it helps us prepare for the visit."
      : "What is the street address of the property? And if you can, send 2-3 photos of the windows here — it helps us prepare for the visit.";
    await sendMessage(
      env,
      event,
      await localizeOperationalMessage(env, followUp, state.lead.language, true),
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
  const formLead = parseLeadFormMessage(event.text);
  if (Object.keys(formLead).length) {
    state.lead = normalizeLeadData(mergeLead(state.lead, formLead));
    console.log(JSON.stringify({ event: "lead_form_parsed", key, fields: Object.keys(formLead) }));
  }
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
  // Once a manager callback is arranged, do not keep re-offering slots (and
  // re-asking for a call time) on every message unless the customer asks.
  const callbackMode =
    (state.stage === "callback_requested" || state.stage === "callback_set") &&
    !startsNewBooking(event.text);
  const callbackStage = state.stage;

  const selectedSlot = parseBookingPayload(event.quickReplyPayload);
  if (selectedSlot) {
    try {
      await bookSelectedSlot(env, event, key, state, selectedSlot);
    } catch (error) {
      console.error("crm_booking", error);
      await askForCallback(env, event, key, state, "booking_failed");
    }
    return;
  }

  if (state.stage === "callback_requested" && looksLikeCallbackTime(event.text)) {
    await confirmCallback(env, event, key, state);
    return;
  }

  state.history.push({ role: "user", content: event.text });
  if (state.history.length > HISTORY_LIMIT) state.history = state.history.slice(-HISTORY_LIMIT);
  await graphPost(env, endpoint, { recipient: { id: event.senderId }, sender_action: "mark_seen" });
  await graphPost(env, endpoint, { recipient: { id: event.senderId }, sender_action: "typing_on" });

  let output: AssistantOutput;
  try {
    output = await askAssistant(env, state.history, state.stage, state.lead);
  } catch (error) {
    console.error("assistant", error);
    await askForCallback(env, event, key, state, "assistant_failed");
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

    if (!alreadyBooked && !callbackMode && !state.escalated && leadReadyForBooking(state.lead)) {
      await offerSlots(env, event, key, state, attemptedBookingClaim ? undefined : output.reply);
      return;
    }
  } catch (error) {
    console.error("crm", error);
    await askForCallback(env, event, key, state, "crm_failed");
    return;
  }

  if (alreadyBooked && !state.escalated) state.stage = "booked";
  if (callbackMode && !state.escalated) state.stage = callbackStage;
  await persistState(env, key, state);
  const missingFieldPrompt = qualificationPrompt(state.lead, state.lead.language);
  const reply = shouldUseQualificationPrompt(attemptedBookingClaim, alreadyBooked) && missingFieldPrompt
    ? await localizeOperationalMessage(env, missingFieldPrompt, state.lead.language)
    : output.reply || await localizeOperationalMessage(
        env,
        callbackQuestion(state.lead),
        state.lead.language,
        true,
      );
  await sendMessage(env, event, reply);
  console.log(JSON.stringify({ key, stage: state.stage, leadCaptured: Boolean(state.leadCapturedEventId) }));
}


/**
 * Meta often delivers an ice-breaker ("Can I book an appointment?") and the
 * lead-form summary as two messages at once. Answer them together, once.
 */
export function groupEventsBySender(events: MessengerEvent[]) {
  const grouped = new Map<string, MessengerEvent>();
  const result: MessengerEvent[] = [];
  for (const event of events) {
    if (event.quickReplyPayload) {
      result.push(event);
      continue;
    }
    const key = `${event.platform}:${event.senderId}`;
    const current = grouped.get(key);
    if (current) {
      current.text = `${current.text}\n${event.text}`;
      current.eventId = event.eventId;
    } else {
      const copy = { ...event };
      grouped.set(key, copy);
      result.push(copy);
    }
  }
  return result;
}

type BurstItem = { id: string; text: string; at: number };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Debounce separate webhook deliveries that arrive within a couple of seconds. */
async function handleIncoming(env: Env, event: MessengerEvent) {
  if (event.quickReplyPayload) return handleEvent(env, event);
  const bufferKey = `burst:${event.platform}:${event.senderId}`;
  const read = async (): Promise<BurstItem[]> => {
    try {
      const raw = await env.CHAT.get(bufferKey);
      const items = raw ? JSON.parse(raw) as BurstItem[] : [];
      return Array.isArray(items) ? items.filter((item) => Date.now() - item.at < 30_000) : [];
    } catch {
      return [];
    }
  };
  try {
    const buffer = await read();
    buffer.push({ id: event.eventId, text: event.text, at: Date.now() });
    await env.CHAT.put(bufferKey, JSON.stringify(buffer), { expirationTtl: 60 });
  } catch (error) {
    console.error("burst_write", error);
    return handleEvent(env, event);
  }
  await sleep(BURST_WINDOW_MS);
  const latest = await read();
  const last = latest[latest.length - 1];
  if (last && last.id !== event.eventId) return; // a newer message will answer for both
  const texts = latest.length ? latest.map((item) => item.text) : [event.text];
  try {
    await env.CHAT.put(bufferKey, "[]", { expirationTtl: 60 });
  } catch (error) {
    console.error("burst_clear", error);
  }
  return handleEvent(env, { ...event, text: [...new Set(texts)].join("\n") });
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
    for (const event of groupEventsBySender(messengerEvents(body))) {
      context.waitUntil(handleIncoming(env, event));
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  },
};
