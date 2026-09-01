import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/env";

export type SessionPayload = {
  sub: string;
  email: string;
  roles: string[];
  pwd: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getEnv().authSecret).update(value).digest("base64url");
}

export function sessionCredentialFingerprint(passwordHash: string | null) {
  return createHash("sha256").update(passwordHash || "no-password").digest("base64url");
}

export function sessionMatchesCurrentCredentials(
  payload: Pick<SessionPayload, "email" | "pwd">,
  email: string,
  passwordHash: string | null,
) {
  return (
    payload.email.trim().toLowerCase() === email.trim().toLowerCase() &&
    payload.pwd === sessionCredentialFingerprint(passwordHash)
  );
}

export function createSessionToken(payload: Omit<SessionPayload, "iat" | "exp">) {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = getEnv().sessionTtlHours * 60 * 60;
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };

  const header = {
    alg: "HS256",
    typ: "ROLANPRO",
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [encodedHeader, encodedPayload, signature, ...extra] = token.split(".");

  if (!encodedHeader || !encodedPayload || !signature || extra.length) {
    return null;
  }

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    !Array.isArray(payload.roles) ||
    typeof payload.pwd !== "string" ||
    payload.pwd.length === 0 ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return payload;
}
