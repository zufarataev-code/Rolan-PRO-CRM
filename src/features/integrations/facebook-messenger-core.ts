import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const FACEBOOK_MESSENGER_PROVIDER = "facebook_messenger";
export const FACEBOOK_MESSENGER_LEAD_ACTION = "integration.facebook_messenger.lead";
export const FACEBOOK_MESSENGER_BOOKING_ACTION = "integration.facebook_messenger.booking";
export const OPEN_LEAD_STATUS_CODES = ["NEW_LEAD", "LEAD", "CONSULTATION_SCHEDULED"];
export const INACTIVE_CALENDAR_STATUSES = ["cancelled", "canceled", "deleted"];

const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_NOTE_LENGTH = 4_000;

export type FacebookMessengerLeadPayload = {
  external_event_id: string;
  external_contact_id: string;
  page_id: string;
  name: string;
  phone: string;
  email?: string;
  service_type?: string;
  property_type?: string;
  city?: string;
  address?: string;
  message?: string;
};

export type FacebookMessengerBookingPayload = FacebookMessengerLeadPayload & {
  title?: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
};

export type FacebookMessengerSlotWindow = {
  startAt: Date;
  endAt: Date;
};

export type FacebookMessengerBusyRange = {
  startAt: Date;
  endAt: Date;
};

export type FacebookMessengerSlotPayload = {
  windows: FacebookMessengerSlotWindow[];
  durationMinutes: number;
  stepMinutes: number;
  limit: number;
};

export class FacebookMessengerIntegrationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly meta: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "FacebookMessengerIntegrationError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  source: Record<string, unknown>,
  key: string,
  maxLength: number,
  label = key,
) {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new FacebookMessengerIntegrationError(400, "invalid_payload", `${label} is required.`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new FacebookMessengerIntegrationError(400, "invalid_payload", `${label} is too long.`);
  }
  return trimmed;
}

function optionalString(source: Record<string, unknown>, key: string, maxLength: number) {
  const value = source[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new FacebookMessengerIntegrationError(400, "invalid_payload", `${key} must be a string.`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new FacebookMessengerIntegrationError(400, "invalid_payload", `${key} is too long.`);
  }
  return trimmed || undefined;
}

function parseIsoDate(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new FacebookMessengerIntegrationError(400, "invalid_payload", `${label} must be a valid ISO date.`);
  }
  return parsed;
}

export function parseFacebookMessengerLeadPayload(value: unknown): FacebookMessengerLeadPayload {
  if (!isRecord(value)) {
    throw new FacebookMessengerIntegrationError(400, "invalid_payload", "JSON object is required.");
  }

  const email = optionalString(value, "email", 191)?.toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new FacebookMessengerIntegrationError(400, "invalid_payload", "email is invalid.");
  }

  const phone = requiredString(value, "phone", 40);
  if (!/^\+\d{8,15}$/.test(normalizeContactPhone(phone))) {
    throw new FacebookMessengerIntegrationError(400, "invalid_payload", "phone is invalid.");
  }

  return {
    external_event_id: requiredString(value, "external_event_id", 255),
    external_contact_id: requiredString(value, "external_contact_id", 255),
    page_id: requiredString(value, "page_id", 255),
    name: requiredString(value, "name", 160),
    phone,
    email,
    service_type: optionalString(value, "service_type", 120),
    property_type: optionalString(value, "property_type", 120),
    city: optionalString(value, "city", 160),
    address: optionalString(value, "address", 1_000),
    message: optionalString(value, "message", MAX_NOTE_LENGTH),
  };
}

export function parseFacebookMessengerBookingPayload(value: unknown): FacebookMessengerBookingPayload {
  const lead = parseFacebookMessengerLeadPayload(value);
  const source = value as Record<string, unknown>;
  const startsAt = parseIsoDate(requiredString(source, "scheduled_start_at", 80), "scheduled_start_at");
  const endsAt = parseIsoDate(requiredString(source, "scheduled_end_at", 80), "scheduled_end_at");
  const durationMs = endsAt.getTime() - startsAt.getTime();

  if (durationMs < 15 * 60 * 1000 || durationMs > 4 * 60 * 60 * 1000) {
    throw new FacebookMessengerIntegrationError(
      400,
      "invalid_payload",
      "Consultation duration must be between 15 minutes and 4 hours.",
    );
  }

  return {
    ...lead,
    title: optionalString(source, "title", 180),
    scheduled_start_at: startsAt.toISOString(),
    scheduled_end_at: endsAt.toISOString(),
  };
}

function positiveInteger(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = source[key] ?? fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new FacebookMessengerIntegrationError(
      400,
      "invalid_payload",
      `${key} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

export function parseFacebookMessengerSlotPayload(value: unknown): FacebookMessengerSlotPayload {
  if (!isRecord(value) || !Array.isArray(value.windows) || value.windows.length < 1 || value.windows.length > 14) {
    throw new FacebookMessengerIntegrationError(
      400,
      "invalid_payload",
      "windows must contain between 1 and 14 time windows.",
    );
  }

  const windows = value.windows.map((item, index) => {
    if (!isRecord(item)) {
      throw new FacebookMessengerIntegrationError(400, "invalid_payload", `windows[${index}] is invalid.`);
    }

    const startAt = parseIsoDate(requiredString(item, "start_at", 80), `windows[${index}].start_at`);
    const endAt = parseIsoDate(requiredString(item, "end_at", 80), `windows[${index}].end_at`);
    const spanMs = endAt.getTime() - startAt.getTime();
    if (spanMs <= 0 || spanMs > 12 * 60 * 60 * 1000) {
      throw new FacebookMessengerIntegrationError(
        400,
        "invalid_payload",
        `windows[${index}] must be positive and no longer than 12 hours.`,
      );
    }
    return { startAt, endAt };
  });

  const earliest = Math.min(...windows.map((window) => window.startAt.getTime()));
  const latest = Math.max(...windows.map((window) => window.endAt.getTime()));
  if (latest - earliest > 31 * 24 * 60 * 60 * 1000) {
    throw new FacebookMessengerIntegrationError(400, "invalid_payload", "Slot search horizon cannot exceed 31 days.");
  }

  return {
    windows,
    durationMinutes: positiveInteger(value, "duration_minutes", 60, 15, 240),
    stepMinutes: positiveInteger(value, "step_minutes", 30, 15, 240),
    limit: positiveInteger(value, "limit", 12, 1, 50),
  };
}

export function normalizeContactPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return value.trim().toLowerCase();
}

export function facebookMessengerIdentityHash(payload: FacebookMessengerLeadPayload) {
  return createHash("sha256")
    .update(`${FACEBOOK_MESSENGER_PROVIDER}:${payload.page_id}:${payload.external_contact_id}`)
    .digest("hex");
}

export function facebookMessengerEventKey(
  action: "lead" | "booking",
  payload: FacebookMessengerLeadPayload,
) {
  return `${FACEBOOK_MESSENGER_PROVIDER}:${action}:${payload.page_id}:${payload.external_event_id}`;
}

export function facebookMessengerContactLockKeys(payload: FacebookMessengerLeadPayload) {
  return [...new Set([
    `identity:${facebookMessengerIdentityHash(payload)}`,
    `phone:${normalizeContactPhone(payload.phone)}`,
    payload.email ? `email:${payload.email.toLowerCase()}` : null,
  ].filter((value): value is string => Boolean(value)))].sort();
}

export function facebookMessengerPayloadHash(
  payload: FacebookMessengerLeadPayload | FacebookMessengerBookingPayload,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        external_event_id: payload.external_event_id,
        external_contact_id: payload.external_contact_id,
        page_id: payload.page_id,
        name: payload.name,
        phone: normalizeContactPhone(payload.phone),
        email: payload.email ?? null,
        service_type: payload.service_type ?? null,
        property_type: payload.property_type ?? null,
        city: payload.city ?? null,
        address: payload.address ?? null,
        message: payload.message ?? null,
        title: "title" in payload ? payload.title ?? null : null,
        scheduled_start_at: "scheduled_start_at" in payload ? payload.scheduled_start_at : null,
        scheduled_end_at: "scheduled_end_at" in payload ? payload.scheduled_end_at : null,
      }),
    )
    .digest("hex");
}

export function buildFacebookMessengerLeadNotes(payload: FacebookMessengerLeadPayload) {
  return [
    "Facebook Messenger inquiry",
    `Messenger identity: ${facebookMessengerIdentityHash(payload)}`,
    payload.service_type ? `Service: ${payload.service_type}` : null,
    payload.property_type ? `Property: ${payload.property_type}` : null,
    payload.city ? `City / Area: ${payload.city}` : null,
    payload.address ? `Address: ${payload.address}` : null,
    payload.message ? `Message: ${payload.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function appendLeadNotes(existing: string | null, addition: string) {
  if (!existing?.trim()) return addition;
  if (existing.includes(addition)) return existing;
  return `${existing.trim()}\n\n${addition}`;
}

export function getFacebookMessengerSharedSecret() {
  const secret = process.env.FACEBOOK_MESSENGER_SHARED_SECRET?.trim() ?? "";
  return secret.length >= 32 ? secret : null;
}

export function createFacebookMessengerSignature(rawBody: string, timestamp: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export function verifyFacebookMessengerSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowMs?: number;
}) {
  const { rawBody, timestamp, signature, secret } = input;
  if (!timestamp || !signature || secret.length < 32 || !/^\d{10,13}$/.test(timestamp)) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  if (Math.abs((input.nowMs ?? Date.now()) - seconds * 1000) > SIGNATURE_TOLERANCE_MS) return false;

  if (!signature.startsWith("sha256=")) return false;
  const provided = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}

export function buildAvailableSlots(input: {
  windows: FacebookMessengerSlotWindow[];
  busyRanges: FacebookMessengerBusyRange[];
  durationMinutes: number;
  stepMinutes: number;
  limit: number;
}) {
  const durationMs = input.durationMinutes * 60 * 1000;
  const stepMs = input.stepMinutes * 60 * 1000;
  const unique = new Map<string, { start_at: string; end_at: string }>();

  for (const window of [...input.windows].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())) {
    for (let cursor = window.startAt.getTime(); cursor + durationMs <= window.endAt.getTime(); cursor += stepMs) {
      const slotEnd = cursor + durationMs;
      const overlaps = input.busyRanges.some(
        (busy) => cursor < busy.endAt.getTime() && slotEnd > busy.startAt.getTime(),
      );
      if (!overlaps) {
        const start_at = new Date(cursor).toISOString();
        unique.set(start_at, { start_at, end_at: new Date(slotEnd).toISOString() });
      }
    }
  }

  return [...unique.values()]
    .sort((left, right) => left.start_at.localeCompare(right.start_at))
    .slice(0, input.limit);
}
