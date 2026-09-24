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
};

export type CrmSlot = {
  start_at: string;
  end_at: string;
};

export function startsNewBooking(text: string) {
  const value = text.trim();
  return /\b(?:another|new)\s+(?:address|location|appointment|booking)\b/i.test(value) ||
    /(?:ещ[её]\s+(?:один|одна|одно)\s+(?:адрес|объект|замер|запис))/i.test(value) ||
    /(?:otr[oa]\s+(?:direcci[oó]n|ubicaci[oó]n|cita))/i.test(value);
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
  const value = language?.trim().toLowerCase() || "en";
  if (value.startsWith("ru") || value.includes("russian") || value.includes("рус")) return "ru";
  if (value.startsWith("es") || value.includes("spanish") || value.includes("españ")) return "es";
  return "en";
}

export function formatSlot(slot: CrmSlot, language?: string) {
  const locale = normalizeLanguage(language) === "ru"
    ? "ru-RU"
    : normalizeLanguage(language) === "es"
      ? "es-US"
      : "en-US";
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
    (lead.address?.trim() || lead.city?.trim()),
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
    city: lead.city?.trim() || undefined,
    address: lead.address?.trim() || undefined,
    message: [lead.goal, lead.windows ? `Approximate windows: ${lead.windows}` : ""]
      .filter(Boolean)
      .join("\n") || undefined,
  };
}
