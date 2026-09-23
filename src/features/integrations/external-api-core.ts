import { createHash, timingSafeEqual } from "node:crypto";

import { apiError } from "@/lib/http/api-response";

const MAX_BODY_BYTES = 64 * 1024;

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
    throw new ExternalApiError(415, "unsupported_media_type", "Content-Type must be application/json.");
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

export function externalLeadEventKey(payload: ExternalLeadPayload) {
  return `${payload.source}:${payload.external_id}`;
}

export function externalLeadPayloadHash(payload: ExternalLeadPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function externalContactIdentity(payload: ExternalLeadPayload) {
  if (!payload.external_contact_id) return null;
  return createHash("sha256")
    .update(`${payload.source}:${payload.external_contact_id}`)
    .digest("hex");
}
