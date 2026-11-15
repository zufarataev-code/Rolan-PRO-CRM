import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

import {
  PASSKEY_CHALLENGE_COOKIE,
  PASSKEY_CHALLENGE_TTL_SECONDS,
  PASSKEY_RP_NAME,
  allowedPasskeyOrigins,
  createChallengeToken,
  readChallengeToken,
  resolveRelyingParty,
  type PasskeyPurpose,
  type RelyingParty,
} from "./passkey-core";

/** Face ID / Touch ID sign-in: database and WebAuthn ceremony glue. */

export const PASSKEY_LIMIT_PER_USER = 10;

const KNOWN_TRANSPORTS = new Set<string>(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
const CHALLENGE_COOKIE_PATH = "/api/v1/auth";

export class PasskeyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function toTransports(values: readonly string[] | undefined | null) {
  return (values ?? []).filter((value) => KNOWN_TRANSPORTS.has(value)) as AuthenticatorTransportFuture[];
}

export function passkeyRelyingParty(request: NextRequest): RelyingParty {
  const env = getEnv();
  const relyingParty = resolveRelyingParty(
    request.headers.get("origin"),
    allowedPasskeyOrigins({
      appUrl: env.appUrl,
      extraOrigins: process.env.PASSKEY_ORIGINS,
    }),
  );

  if (!relyingParty) {
    throw new PasskeyError(
      400,
      "passkey_origin_not_allowed",
      "Вход по Face ID недоступен с этого адреса. Откройте CRM по основному адресу.",
    );
  }

  return relyingParty;
}

export function setPasskeyChallenge(
  response: NextResponse,
  input: { purpose: PasskeyPurpose; challenge: string; rpId: string; userId?: string },
) {
  const env = getEnv();
  response.cookies.set({
    name: PASSKEY_CHALLENGE_COOKIE,
    value: createChallengeToken(env.authSecret, input),
    httpOnly: true,
    sameSite: "strict",
    secure: env.nodeEnv === "production",
    path: CHALLENGE_COOKIE_PATH,
    maxAge: PASSKEY_CHALLENGE_TTL_SECONDS,
  });
}

/** A challenge is single-use: every verify response clears it, pass or fail. */
export function clearPasskeyChallenge(response: NextResponse) {
  const env = getEnv();
  response.cookies.set({
    name: PASSKEY_CHALLENGE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: env.nodeEnv === "production",
    path: CHALLENGE_COOKIE_PATH,
    maxAge: 0,
  });
}

export function readPasskeyChallenge(
  request: NextRequest,
  expected: { purpose: PasskeyPurpose; rpId: string; userId?: string },
) {
  const challenge = readChallengeToken(
    getEnv().authSecret,
    request.cookies.get(PASSKEY_CHALLENGE_COOKIE)?.value,
    expected,
  );

  if (!challenge) {
    throw new PasskeyError(400, "passkey_challenge_expired", "Время на подтверждение вышло. Попробуйте ещё раз.");
  }

  return challenge;
}

export async function listPasskeys(userId: string) {
  const rows = await prisma.passkeyCredential.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    select: { passkey_id: true, device_name: true, rp_id: true, created_at: true, last_used_at: true },
  });

  return rows.map((row) => ({
    passkey_id: row.passkey_id,
    device_name: row.device_name,
    rp_id: row.rp_id,
    created_at: row.created_at.toISOString(),
    last_used_at: row.last_used_at ? row.last_used_at.toISOString() : null,
  }));
}

export async function beginPasskeyRegistration(
  user: { user_id: string; email: string; full_name: string },
  relyingParty: RelyingParty,
) {
  const existing = await prisma.passkeyCredential.findMany({
    where: { user_id: user.user_id },
    select: { credential_id: true, transports: true, rp_id: true },
  });

  if (existing.length >= PASSKEY_LIMIT_PER_USER) {
    throw new PasskeyError(
      409,
      "passkey_limit_reached",
      `Уже подключено ${PASSKEY_LIMIT_PER_USER} устройств. Отключите лишнее и попробуйте снова.`,
    );
  }

  return generateRegistrationOptions({
    rpName: PASSKEY_RP_NAME,
    rpID: relyingParty.rpId,
    userName: user.email,
    userDisplayName: user.full_name,
    userID: new TextEncoder().encode(user.user_id),
    attestationType: "none",
    // The same device must not be enrolled twice for the same address.
    excludeCredentials: existing
      .filter((credential) => credential.rp_id === relyingParty.rpId)
      .map((credential) => ({ id: credential.credential_id, transports: toTransports(credential.transports) })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "required",
      userVerification: "required",
    },
  });
}

export async function finishPasskeyRegistration(input: {
  userId: string;
  relyingParty: RelyingParty;
  expectedChallenge: string;
  response: RegistrationResponseJSON;
  deviceName: string;
}) {
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: input.relyingParty.origin,
      expectedRPID: input.relyingParty.rpId,
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError(400, "passkey_registration_failed", "Не удалось включить Face ID. Попробуйте ещё раз.");
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw new PasskeyError(400, "passkey_registration_failed", "Не удалось включить Face ID. Попробуйте ещё раз.");
  }

  const { credential } = verification.registrationInfo;

  const count = await prisma.passkeyCredential.count({ where: { user_id: input.userId } });
  if (count >= PASSKEY_LIMIT_PER_USER) {
    throw new PasskeyError(409, "passkey_limit_reached", "Достигнут предел подключённых устройств.");
  }

  try {
    const created = await prisma.passkeyCredential.create({
      data: {
        user_id: input.userId,
        credential_id: credential.id,
        public_key: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: toTransports(credential.transports ?? input.response.response.transports),
        rp_id: input.relyingParty.rpId,
        device_name: input.deviceName,
      },
      select: { passkey_id: true, device_name: true },
    });
    return created;
  } catch {
    // Unique credential_id: this authenticator is already enrolled.
    throw new PasskeyError(409, "passkey_already_registered", "Это устройство уже подключено.");
  }
}

export async function beginPasskeyLogin(relyingParty: RelyingParty) {
  // No allow-list: the device offers its own discoverable key, so the login
  // screen needs no email and reveals nothing about who has a key.
  return generateAuthenticationOptions({
    rpID: relyingParty.rpId,
    userVerification: "required",
    allowCredentials: [],
  });
}

const LOGIN_FAILED = "Не удалось войти по Face ID. Войдите по паролю и включите Face ID на этом устройстве заново.";

export async function finishPasskeyLogin(input: {
  relyingParty: RelyingParty;
  expectedChallenge: string;
  response: AuthenticationResponseJSON;
}) {
  const credentialId = typeof input.response?.id === "string" ? input.response.id : "";
  const stored = credentialId
    ? await prisma.passkeyCredential.findUnique({
        where: { credential_id: credentialId },
        include: {
          user: {
            include: {
              user_accesses: {
                where: { is_active: true, role: { is_active: true } },
                include: { role: true },
              },
            },
          },
        },
      })
    : null;

  // One message for every failure: unknown key, revoked key, deactivated
  // employee, wrong address or bad signature are indistinguishable outside.
  if (!stored || !stored.user.is_active || stored.rp_id !== input.relyingParty.rpId) {
    throw new PasskeyError(401, "passkey_login_failed", LOGIN_FAILED);
  }

  const userHandle = input.response.response?.userHandle;
  if (userHandle && Buffer.from(userHandle, "base64url").toString("utf8") !== stored.user_id) {
    throw new PasskeyError(401, "passkey_login_failed", LOGIN_FAILED);
  }

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: input.relyingParty.origin,
      expectedRPID: input.relyingParty.rpId,
      requireUserVerification: true,
      credential: {
        id: stored.credential_id,
        publicKey: new Uint8Array(stored.public_key),
        counter: Number(stored.counter),
        transports: toTransports(stored.transports),
      },
    });
  } catch {
    throw new PasskeyError(401, "passkey_login_failed", LOGIN_FAILED);
  }

  if (!verification.verified) {
    throw new PasskeyError(401, "passkey_login_failed", LOGIN_FAILED);
  }

  const roles = stored.user.user_accesses.map((access) => access.role.code);
  if (roles.length === 0) {
    throw new PasskeyError(403, "access_not_granted", "У этого сотрудника нет активной роли. Обратитесь к владельцу.");
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.passkeyCredential.update({
      where: { passkey_id: stored.passkey_id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), last_used_at: now },
    }),
    prisma.user.update({ where: { user_id: stored.user_id }, data: { last_login_at: now } }),
  ]);

  return { user: stored.user, roles };
}

export async function deletePasskey(userId: string, passkeyId: string) {
  const result = await prisma.passkeyCredential.deleteMany({ where: { user_id: userId, passkey_id: passkeyId } });
  return result.count;
}

export async function deleteAllPasskeys(userId: string) {
  const result = await prisma.passkeyCredential.deleteMany({ where: { user_id: userId } });
  return result.count;
}
