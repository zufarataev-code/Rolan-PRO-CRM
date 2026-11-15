import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure helpers for Face ID / Touch ID sign-in (WebAuthn). No database and no
 * request objects here so the security-relevant rules stay unit-testable.
 */

export const PASSKEY_CHALLENGE_COOKIE = "rolanpro_passkey_challenge";
export const PASSKEY_CHALLENGE_TTL_SECONDS = 5 * 60;
export const PASSKEY_RP_NAME = "ROLANPRO CRM";
export const PASSKEY_DEVICE_NAME_MAX = 120;

export type PasskeyPurpose = "register" | "login";

export type RelyingParty = {
  origin: string;
  rpId: string;
};

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Origins that may register and use keys: APP_URL plus an optional
 * comma-separated PASSKEY_ORIGINS (for a second domain during a move).
 * Plain http is accepted only for the machine itself (localhost), which a
 * browser also treats as a secure context; every other origin must be https.
 */
export function allowedPasskeyOrigins(input: { appUrl: string; extraOrigins?: string }) {
  const candidates = [input.appUrl, ...(input.extraOrigins ?? "").split(",")];
  const origins = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate.trim()) {
      continue;
    }
    const origin = normalizeOrigin(candidate);
    if (!origin) {
      continue;
    }
    const url = new URL(origin);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "http:" && !isLocalhost) {
      continue;
    }
    origins.add(origin);
  }

  return [...origins];
}

/**
 * The relying party is taken from the request's Origin header, but only when
 * that origin is on the allow-list. The Host header is never trusted.
 */
export function resolveRelyingParty(requestOrigin: string | null, allowedOrigins: readonly string[]): RelyingParty | null {
  if (!requestOrigin) {
    return null;
  }
  const origin = normalizeOrigin(requestOrigin);
  if (!origin || !allowedOrigins.includes(origin)) {
    return null;
  }
  return { origin, rpId: new URL(origin).hostname };
}

function signChallenge(secret: string, body: string) {
  return createHmac("sha256", secret).update(`passkey-challenge:${body}`).digest("base64url");
}

/**
 * The challenge travels in a signed, short-lived, httpOnly cookie instead of
 * a table: it is bound to its purpose, to the relying party and, for
 * registration, to the signed-in user.
 */
export function createChallengeToken(
  secret: string,
  input: { purpose: PasskeyPurpose; challenge: string; rpId: string; userId?: string },
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const body = Buffer.from(
    JSON.stringify({
      p: input.purpose,
      c: input.challenge,
      r: input.rpId,
      u: input.userId ?? "",
      e: nowSeconds + PASSKEY_CHALLENGE_TTL_SECONDS,
    }),
  ).toString("base64url");
  return `${body}.${signChallenge(secret, body)}`;
}

export function readChallengeToken(
  secret: string,
  token: string | undefined | null,
  expected: { purpose: PasskeyPurpose; rpId: string; userId?: string },
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!token) {
    return null;
  }
  const [body, signature, ...extra] = token.split(".");
  if (!body || !signature || extra.length) {
    return null;
  }
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(signChallenge(secret, body));
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return null;
  }

  let payload: { p?: unknown; c?: unknown; r?: unknown; u?: unknown; e?: unknown };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    payload.p !== expected.purpose ||
    payload.r !== expected.rpId ||
    payload.u !== (expected.userId ?? "") ||
    typeof payload.c !== "string" ||
    payload.c.length === 0 ||
    typeof payload.e !== "number" ||
    payload.e <= nowSeconds
  ) {
    return null;
  }

  return payload.c;
}

/** Storage key under which a presented challenge is recorded as used. */
export function challengeUseKey(challenge: string) {
  return createHash("sha256").update(`passkey-challenge-use:${challenge}`).digest("hex");
}

/** A short human label for the device list, derived from the user agent. */
export function describePasskeyDevice(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  let device = "Устройство";
  if (/iPad/i.test(ua)) device = "iPad";
  else if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/Android/i.test(ua)) device = "Android";
  else if (/Macintosh|Mac OS X/i.test(ua)) device = "Mac";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/Linux/i.test(ua)) device = "Linux";

  let browser = "";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/CriOS|Chrome\//i.test(ua)) browser = "Chrome";
  else if (/FxiOS|Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  return (browser ? `${device} · ${browser}` : device).slice(0, PASSKEY_DEVICE_NAME_MAX);
}

export function cleanPasskeyDeviceName(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, PASSKEY_DEVICE_NAME_MAX) : fallback;
}
