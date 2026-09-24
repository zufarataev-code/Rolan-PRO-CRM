import { timingSafeEqual } from "node:crypto";

export function authorizeGoogleAdsSync(authorizationHeader: string | null, configuredSecret: string | undefined) {
  const secret = configuredSecret?.trim() ?? "";
  if (secret.length < 32) return "not_configured" as const;

  const prefix = "Bearer ";
  if (!authorizationHeader?.startsWith(prefix)) return "unauthorized" as const;
  const received = authorizationHeader.slice(prefix.length).trim();
  const expectedBuffer = Buffer.from(secret, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return "unauthorized" as const;
  return timingSafeEqual(expectedBuffer, receivedBuffer) ? ("authorized" as const) : ("unauthorized" as const);
}
