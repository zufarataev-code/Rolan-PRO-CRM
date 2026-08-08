import type { Prisma } from "@prisma/client";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function clear(object: JsonObject | null, key: string) {
  if (object && key in object) {
    object[key] = "";
  }
}

export function validateLegacyPayload(value: unknown): value is JsonObject {
  const payload = asObject(value);

  return Boolean(
    payload &&
      Array.isArray(payload.users) &&
      Array.isArray(payload.clients) &&
      Array.isArray(payload.orders) &&
      asObject(payload.settings),
  );
}

export function sanitizeLegacyPayload(value: JsonObject): Prisma.InputJsonValue {
  const payload = JSON.parse(JSON.stringify(value)) as JsonObject;
  const settings = asObject(payload.settings);
  const integrations = asObject(settings?.integrations);
  const integrationAi = asObject(integrations?.ai);
  const ai = asObject(settings?.ai);
  const sms = asObject(settings?.sms);
  const twilio = asObject(sms?.twilio);
  const textbelt = asObject(sms?.textbelt);
  const stripe = asObject(settings?.stripe);

  clear(settings, "telegramBotToken");
  clear(settings, "googleMapsApiKey");
  clear(integrations, "googleMapsApiKey");
  clear(integrations, "leadBackendKey");
  clear(integrationAi, "apiKey");
  clear(ai, "apiKey");
  clear(twilio, "authToken");
  clear(twilio, "apiKeySecret");
  clear(textbelt, "apiKey");
  clear(stripe, "secretKey");

  if (Array.isArray(payload.users)) {
    for (const user of payload.users) {
      clear(asObject(user), "pin");
    }
  }

  return payload as Prisma.InputJsonValue;
}
