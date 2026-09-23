import { createHash, timingSafeEqual } from "node:crypto";

import { apiError } from "@/lib/http/api-response";

const MAX_BODY_BYTES = 64 * 1024;

export const INACTIVE_CALENDAR_STATUSES = ["cancelled", "canceled", "deleted"];

export type ExternalLeadPayload = {
  source: string;
  external_id: string;
  external_contact_id?: string;
  name: string;
  phone: string;
  email?: string;
  service_type?: string;
  property_type?: string;
  city?: string;
  address?: string;
  message?: string;
};

export type ExternalBookingPayload = ExternalLeadPayload & {
  title?: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
};

export type ExternalSlotWindow = {
  startAt: Date;
  endAt: Date;
};

export type ExternalBusyRange = {
  startAt: Date;
  endAt: Date;
};

export type ExternalSlotPayload = {
  windows: ExternalSlotWindow[];
  durationMinutes: number;
  stepMinutes: number;
  limit: number;
};

export class ExternalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly meta: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ExternalApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(source: Record<string, unknown>, key: string, maxLength: number) {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ExternalApiError(400, "invalid_payload", `${key} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ExternalApiError(400, "invalid_payload", `${key} is too long.`);
  }
  return trimmed;
}

function optionalString(source: Record<string, unknown>, key: string, maxLength: number) {
  const value = source[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ExternalApiError(400, "invalid_payload", `${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ExternalApiError(400, "invalid_payload", `${key} is too long.`);
  }
  return trimmed || undefined;
}

function positiveInteger(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = source[key];
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new ExternalApiError(
      400,
      "invalid_payload",
      `${key} must be an integer between ${min} and ${max}.`,
    );
  }
  return Number(value);
}

function parseIsoDate(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ExternalApiError(400, "invalid_payload", `${label} must be a valid ISO date.`);
  }
  return parsed;
}

export function parseExternalLeadPayload(value: unknown): ExternalLeadPayload {
  if (!isRecord(value)) {
    throw new ExternalApiError(400, "invalid_payload", "JSON object is required.");
  }

  const source = requiredString(value, "source", 80).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(source)) {
    throw new ExternalApiError(
      400,
      "invalid_payload",
      "source may contain only lowercase letters, numbers, dot, underscore, and dash.",
    );
  }

  const email = optionalString(value, "email", 191)?.toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ExternalApiError(400, "invalid_payload", "email is invalid.");
  }

  return {
    source,
    external_id: requiredString(value, "external_id", 191),
    external_contact_id: optionalString(value, "external_contact_id", 191),
    name: requiredString(value, "name", 160),
    phone: requiredString(value, "phone", 40),
    email,
    service_type: optionalString(value, "service_type", 160),
    property_type: optionalString(value, "property_type", 160),
    city: optionalString(value, "city", 160),
    address: optionalString(value, "address", 255),
    message: optionalString(value, "message", 4_000),
  };
}

export function parseExternalBookingPayload(value: unknown): ExternalBookingPayload {
  if (!isRecord(value)) {
    throw new ExternalApiError(400, "invalid_payload", "JSON object is required.");
  }

  const lead = parseExternalLeadPayload(value);
  const scheduledStart = requiredString(value, "scheduled_start_at", 80);
  const scheduledEnd = requiredString(value, "scheduled_end_at", 80);
  const startsAt = parseIsoDate(scheduledStart, "scheduled_start_at");
  const endsAt = parseIsoDate(scheduledEnd, "scheduled_end_at");

  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new ExternalApiError(
      400,
      "invalid_payload",
      "scheduled_end_at must be after scheduled_start_at.",
    );
  }

  if (endsAt.getTime() - startsAt.getTime() > 12 * 60 * 60 * 1000) {
    throw new ExternalApiError(
      400,
      "invalid_payload",
      "Consultation duration cannot exceed 12 hours.",
    );
  }

  return {
    ...lead,
    title: optionalString(value, "title", 180),
    scheduled_start_at: startsAt.toISOString(),
    scheduled_end_at: endsAt.toISOString(),
  };
}

export function parseExternalSlotPayload(value: unknown): ExternalSlotPayload {
  if (!isRecord(value)) {
    throw new ExternalApiError(400, "invalid_payload", "JSON object is required.");
  }

  const rawWindows = value.windows;
  if (!Array.isArray(rawWindows) || rawWindows.length === 0 || rawWindows.length > 31) {
    throw new ExternalApiError(
      400,
      "invalid_payload",
      "windows must contain between 1 and 31 time windows.",
    );
  }

  const windows = rawWindows.map((item, index) => {
    if (!isRecord(item)) {
      throw new ExternalApiError(400, "invalid_payload", `windows[${index}] is invalid.`);
    }

    const startAt = parseIsoDate(
      requiredString(item, "start_at", 80),
      `windows[${index}].start_at`,
    );
    const endAt = parseIsoDate(
      requiredString(item, "end_at", 80),
      `windows[${index}].end_at`,
    );
    const spanMs = endAt.getTime() - startAt.getTime();

    if (spanMs <= 0 || spanMs > 12 * 60 * 60 * 1000) {
      throw new ExternalApiError(
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
    throw new ExternalApiError(
      400,
      "invalid_payload",
      "Slot search horizon cannot exceed 31 days.",
    );
  }

  return {
    windows,
    durationMinutes: positiveInteger(value, "duration_minutes", 60, 15, 240),
    stepMinutes: positiveInteger(value, "step_minutes", 30, 15, 240),
    limit: positiveInteger(value, "limit", 12, 1, 50),
  };
}

export function buildAvailableSlots(input: {
  windows: ExternalSlotWindow[];
  busyRanges: ExternalBusyRange[];
  durationMinutes: number;
  stepMinutes: number;
  limit: number;
}) {
  const durationMs = input.durationMinutes * 60 * 1000;
  const stepMs = input.stepMinutes * 60 * 1000;
  const unique = new Map<string, { start_at: string; end_at: string }>();

  for (const window of [...input.windows].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())) {
    for (
      let cursor = window.startAt.getTime();
      cursor + durationMs <= window.endAt.getTime();
      cursor += stepMs
    ) {
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

export function getExternalApiKey() {
  const key = process.env.ROLANPRO_EXTERNAL_API_KEY?.trim() ?? "";
  return key.length >= 32 ? key : null;
}

export function verifyExternalApiBearerToken(
  authorization: string | null,
  expectedKey: string | null = getExternalApiKey(),
) {
  if (!authorization || !expectedKey) return false;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const provided = match?.[1]?.trim();
  if (!provided) return false;

  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expectedKey).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export function authorizeExternalApiRequest(request: Request) {
  const expectedKey = getExternalApiKey();
  if (!expectedKey) {
    throw new ExternalApiError(
      503,
      "external_api_not_configured",
      "External API key is not configured.",
    );
  }
  if (!verifyExternalApiBearerToken(request.headers.get("authorization"), expectedKey)) {
    throw new ExternalApiError(401, "unauthorized", "Invalid external API credentials.");
  }
}

export async function readExternalApiJson(request: Request) {
  authorizeExternalApiRequest(request);

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new ExternalApiError(
      415,
      "unsupported_media_type",
      "Content-Type must be application/json.",
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new ExternalApiError(413, "payload_too_large", "Request body is too large.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw new ExternalApiError(413, "payload_too_large", "Request body is too large.");
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new ExternalApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export function externalApiErrorResponse(error: unknown) {
  if (error instanceof ExternalApiError) {
    return apiError(error.status, error.code, error.message, error.meta);
  }
  console.error("[External API] Unexpected error", error);
  return apiError(500, "external_api_failed", "External API request failed.");
}

export function externalEventKey(
  action: "lead" | "booking",
  payload: ExternalLeadPayload,
) {
  return `${payload.source}:${action}:${payload.external_id}`;
}

export function externalPayloadHash(payload: ExternalLeadPayload | ExternalBookingPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function externalContactIdentity(payload: ExternalLeadPayload) {
  if (!payload.external_contact_id) return null;
  return createHash("sha256")
    .update(`${payload.source}:${payload.external_contact_id}`)
    .digest("hex");
}
