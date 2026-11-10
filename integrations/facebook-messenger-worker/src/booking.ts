export const BOOKING_PAYLOAD_PREFIX = "ROLANPRO_BOOK|";
export const CRM_TIME_ZONE = "America/Los_Angeles";

export type LeadData = {
  name?: string;
  language?: string;
  serviceType?: string;
  propertyType?: string;
  objectType?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  goal?: string;
  windows?: string;
  zip?: string;
  callbackTime?: string;
};

const FORM_FIELD_ALIASES: Array<[RegExp, keyof LeadData]> = [
  [/^(?:full\s*name|name|first\s*name|имя|nombre(?:\s+completo)?)$/i, "name"],
  [/^(?:phone(?:\s*number)?|mobile|telephone|телефон|tel[eé]fono)$/i, "phone"],
  [/^(?:e-?mail|почта|correo(?:\s+electr[oó]nico)?)$/i, "email"],
  [/^(?:zip(?:\s*code)?|postal\s*code|post\s*code|индекс|c[oó]digo\s+postal)$/i, "zip"],
  [/^(?:city|город|ciudad)$/i, "city"],
  [/^(?:street\s*address|address|адрес|direcci[oó]n)$/i, "address"],
  [/(?:service|film|considering|услуг|servicio)/i, "serviceType"],
  [/(?:property|home or business|residential|commercial|объект|propiedad)/i, "propertyType"],
  [/(?:windows|how many|окон|ventanas)/i, "windows"],
];

const FORM_INTRO_PATTERNS = [
  /^(?:hello[!,.]?\s*)?i (?:filled out|submitted|completed) (?:your|the) form(?:\s+and\s+.*)?[.!]?$/i,
  /^(?:hello[!,.]?\s*)?(?:thanks?[,!]?\s*)?i(?:'d| would) like to (?:know|learn) more about (?:your|the) business[.!]?$/i,
];

const DIRECT_QUESTION_PATTERN =
  /\?|^(?:how|what|when|where|why|who|which|can|could|would|will|do|does|did|is|are|should|сколько|как|когда|где|почему|кто|какой|можно|можете|есть|будет|cu[aá]nto|c[oó]mo|cu[aá]ndo|d[oó]nde|por qu[eé]|qui[eé]n|puede|puedo|hay|es|son)\b/i;

/**
 * Meta appends instant-form answers to a Messenger message. Return only a
 * genuine customer question outside those form fields. The standard Meta
 * intro ("I filled out your form...") is not a sales question and must not
 * start another qualification interview.
 */
export function extractLeadFormQuestion(text: string) {
  const freeText: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator > 0) {
      const label = line.slice(0, separator).replace(/[?*]+$/g, "").trim();
      if (FORM_FIELD_ALIASES.some(([pattern]) => pattern.test(label))) continue;
    }
    if (FORM_INTRO_PATTERNS.some((pattern) => pattern.test(line))) continue;
    freeText.push(line);
  }
  const candidate = freeText.join(" ").trim();
  if (!candidate || !DIRECT_QUESTION_PATTERN.test(candidate)) return undefined;
  return candidate.slice(0, 600);
}

/**
 * Meta drops the instant-form answers into Messenger as plain text
 * ("Full name: …", "Phone number: …"). Read them deterministically so the
 * assistant never asks the customer for facts the form already supplied.
 */
export function parseLeadFormMessage(text: string): LeadData {
  const lead: LeadData = {};
  if (!/:\s*\S/.test(text)) return lead;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const label = line.slice(0, separator).replace(/[?*]+$/g, "").trim();
    const value = line.slice(separator + 1).trim();
    if (!label || !value || label.length > 120) continue;
    const field = FORM_FIELD_ALIASES.find(([pattern]) => pattern.test(label))?.[1];
    if (!field || lead[field]) continue;
    lead[field] = value.slice(0, 300);
  }
  if (lead.serviceType) lead.serviceType = detectServiceType(lead.serviceType) || lead.serviceType;
  if (lead.zip && !/^\d{5}(?:-\d{4})?$/.test(lead.zip)) delete lead.zip;
  if (lead.phone && lead.phone.replace(/\D/g, "").length < 10) delete lead.phone;
  // A lone "Name: x" line in a normal chat message is not a form.
  return Object.keys(lead).length >= 2 ? lead : {};
}

const LEAD_FACT_LABELS: Array<[keyof LeadData, string]> = [
  ["name", "Name"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["serviceType", "Service"],
  ["propertyType", "Property type"],
  ["goal", "Problem / goal"],
  ["windows", "Approximate windows"],
  ["zip", "ZIP from the lead form"],
  ["city", "City / area"],
  ["address", "Property address"],
  ["callbackTime", "Preferred callback time"],
];

export function knownLeadFacts(lead: LeadData) {
  const lines = LEAD_FACT_LABELS
    .filter(([key]) => lead[key]?.trim())
    .map(([key, label]) => `- ${label}: ${lead[key]!.trim()}`);
  return lines.length
    ? `Facts already collected about this customer (NEVER ask for any of these again; use them):\n${lines.join("\n")}`
    : "No customer facts collected yet.";
}

/** Business hours in Los Angeles: Monday–Saturday, 08:00–18:00. */
export function isBusinessHours(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CRM_TIME_ZONE,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return parts.weekday !== "Sun" && Number(parts.hour) >= 8 && Number(parts.hour) < 18;
}

export function looksLikeCallbackTime(text: string) {
  return /\d|morning|afternoon|evening|noon|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|anytime|any time|утр|днём|днем|вечер|завтра|сегодня|понедельник|вторник|сред|четверг|пятниц|суббот|любое|mañana|tarde|hoy|lunes|martes|miércoles|jueves|viernes|sábado/i.test(text);
}

export type CrmSlot = {
  start_at: string;
  end_at: string;
};

export function startsNewBooking(text: string) {
  const value = text.trim();
  return /\b(?:another|new)\s+(?:address|location|appointment|booking)\b/i.test(value) ||
    /\b(?:book\s+me|schedule\s+(?:a\s+)?(?:consultation|appointment|measurement)|i\s+want\s+to\s+book)\b/i.test(value) ||
    /(?:ещ[её]\s+(?:один|одна|одно)\s+(?:адрес|объект|замер|запис))/i.test(value) ||
    /(?:запиш(?:и|ите|ись|емся)|хочу\s+записаться|давайте\s+запишемся|назнач(?:ить|ьте)\s+замер|нуж(?:ен|на)\s+замер|забронируй)/i.test(value) ||
    /(?:otr[oa]\s+(?:direcci[oó]n|ubicaci[oó]n|cita)|quiero\s+(?:reservar|agendar)\s+(?:una\s+)?cita|agendar\s+(?:una\s+)?cita)/i.test(value);
}

export function shouldUseQualificationPrompt(attemptedBookingClaim: boolean, alreadyBooked: boolean) {
  return attemptedBookingClaim && !alreadyBooked;
}

export function shouldRestartBookedConversation(
  attemptedBookingClaim: boolean,
  alreadyBooked: boolean,
) {
  return attemptedBookingClaim && alreadyBooked;
}

export function detectServiceType(value?: string) {
  const text = value?.trim().toLowerCase().replaceAll("ё", "е") || "";
  if (!text) return undefined;

  if (/\b(?:smart|pdlc|switchable)\b|смарт|умн(?:ая|ой|ую|ые|ый|ое)\s+плен/i.test(text)) {
    return "Smart Film";
  }
  // Check Solar before Safety: Russian "солнцезащитная" contains "защит" too.
  if (
    /\b(?:solar|sun|sunlight|heat control)\b|солнц|солнеч|жар|блик|тониров|ультрафиолет|защит[а-я]*\s+от\s+(?:солнц|жар|блик|ультрафиолет)/i.test(text)
  ) {
    return "Solar Film";
  }
  if (
    /\b(?:safety|security|protective)\b|защит[а-я]*\s+(?:плен|стекл|окон)|броне?плен|антиудар|взлом|оскол/i.test(text)
  ) {
    return "Safety Film";
  }
  if (/\b(?:decorative|frosted|privacy)\b|декор|матов|приват/i.test(text)) {
    return "Decorative Film";
  }
  return undefined;
}

export function normalizeLeadData(lead: LeadData, latestMessage?: string): LeadData {
  const normalized = { ...lead };
  if (!normalized.propertyType?.trim() && normalized.objectType?.trim()) {
    normalized.propertyType = normalized.objectType.trim();
  }
  const detected = detectServiceType(latestMessage) ||
    detectServiceType(normalized.serviceType) ||
    detectServiceType(normalized.goal);
  if (detected) normalized.serviceType = detected;
  return normalized;
}

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function zonedParts(date: Date) {
  const parts = Object.fromEntries(
    zonedFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
) {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(guess));
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const adjustment = target - actualAsUtc;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(guess);
}

export function buildBusinessWindows(now = new Date(), count = 6) {
  const localNow = zonedParts(now);
  const windows: Array<{ start_at: string; end_at: string }> = [];

  for (let offset = 0; offset < 15 && windows.length < count; offset += 1) {
    const date = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + offset));
    if (date.getUTCDay() === 0) continue;

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    let startHour = 8;
    if (offset === 0) {
      startHour = Math.max(8, localNow.hour + 2);
      if (localNow.minute > 0) startHour += 1;
    }
    if (startHour >= 17) continue;

    windows.push({
      start_at: zonedLocalToUtc(year, month, day, startHour).toISOString(),
      end_at: zonedLocalToUtc(year, month, day, 17).toISOString(),
    });
  }
  return windows;
}

export function normalizeLanguage(language?: string) {
  const value = language?.trim() || "";
  const lower = value.toLowerCase();
  const aliases: Array<[RegExp, string]> = [
    [/^(?:ru|russian|русский|рус)$/i, "ru"],
    [/^(?:es|spanish|español)$/i, "es"],
    [/^(?:en|english|английский)$/i, "en"],
    [/^(?:de|german|deutsch|немецкий)$/i, "de"],
    [/^(?:fr|french|français|французский)$/i, "fr"],
    [/^(?:pt|portuguese|português|португальский)$/i, "pt"],
    [/^(?:it|italian|italiano|итальянский)$/i, "it"],
    [/^(?:uk|ukrainian|українська|украинский)$/i, "uk"],
    [/^(?:pl|polish|polski|польский)$/i, "pl"],
    [/^(?:tr|turkish|türkçe|турецкий)$/i, "tr"],
    [/^(?:ar|arabic|العربية|арабский)$/i, "ar"],
    [/^(?:he|hebrew|עברית|иврит)$/i, "he"],
    [/^(?:fa|persian|farsi|فارسی|персидский)$/i, "fa"],
    [/^(?:hi|hindi|हिन्दी|हिंदी)$/i, "hi"],
    [/^(?:zh|chinese|中文|китайский)$/i, "zh"],
    [/^(?:ja|japanese|日本語|японский)$/i, "ja"],
    [/^(?:ko|korean|한국어|корейский)$/i, "ko"],
    [/^(?:vi|vietnamese|tiếng việt|вьетнамский)$/i, "vi"],
  ];
  for (const [pattern, tag] of aliases) {
    if (pattern.test(lower)) return tag;
  }
  try {
    return Intl.getCanonicalLocales(value.replaceAll("_", "-"))[0] || "en";
  } catch {
    return "en";
  }
}

export function formatSlot(slot: CrmSlot, language?: string) {
  const languageTag = normalizeLanguage(language);
  const locale = languageTag === "ru" ? "ru-RU" : languageTag === "es" ? "es-US" : languageTag;
  return new Intl.DateTimeFormat(locale, {
    timeZone: CRM_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(slot.start_at));
}

export function bookingPayload(slot: CrmSlot) {
  return `${BOOKING_PAYLOAD_PREFIX}${slot.start_at}|${slot.end_at}`;
}

export function parseBookingPayload(value?: string) {
  if (!value?.startsWith(BOOKING_PAYLOAD_PREFIX)) return null;
  const [start_at, end_at] = value.slice(BOOKING_PAYLOAD_PREFIX.length).split("|");
  if (!start_at || !end_at || Number.isNaN(Date.parse(start_at)) || Number.isNaN(Date.parse(end_at))) {
    return null;
  }
  return { start_at, end_at };
}

export function leadReadyForCrm(lead: LeadData) {
  return Boolean(lead.name?.trim() && lead.phone?.trim());
}

export function leadReadyForBooking(lead: LeadData) {
  return Boolean(
    leadReadyForCrm(lead) &&
    lead.serviceType?.trim() &&
    (lead.propertyType?.trim() || lead.objectType?.trim()) &&
    (lead.address?.trim() || lead.city?.trim() || lead.zip?.trim()),
  );
}

export function crmLeadPayload(
  lead: LeadData,
  eventId: string,
  contactId: string,
  pageId: string,
) {
  return {
    external_event_id: eventId,
    external_contact_id: contactId,
    page_id: pageId,
    name: lead.name?.trim(),
    phone: lead.phone?.trim(),
    email: lead.email?.trim() || undefined,
    service_type: lead.serviceType?.trim() || undefined,
    property_type: lead.propertyType?.trim() || lead.objectType?.trim() || undefined,
    city: [lead.city?.trim(), lead.zip?.trim()].filter(Boolean).join(", ") || undefined,
    address: lead.address?.trim() || undefined,
    message: [
      lead.goal,
      lead.windows ? `Approximate windows: ${lead.windows}` : "",
      lead.callbackTime ? `Preferred callback time: ${lead.callbackTime}` : "",
    ]
      .filter(Boolean)
      .join("\n") || undefined,
  };
}
