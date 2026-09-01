import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { primaryGmailConnection, sendPrimaryGmail } from "@/features/gmail/service";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 10;
const REQUEST_COOLDOWN_MS = 60 * 1000;
const lastResetRequestAt = new Map<string, number>();

type PasswordResetPayload = {
  v: 1;
  uid: string;
  email: string;
  exp: number;
  pwd: string;
};

export class PasswordRecoveryError extends Error {
  constructor(
    public readonly code: "invalid_token" | "delivery_unavailable" | "invalid_password",
    message: string,
  ) {
    super(message);
    this.name = "PasswordRecoveryError";
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function passwordFingerprint(passwordHash: string | null) {
  return createHash("sha256").update(passwordHash || "no-password").digest("base64url");
}

function tokenSignature(encodedPayload: string) {
  return createHmac("sha256", getEnv().authSecret).update(encodedPayload).digest("base64url");
}

function encodePayload(payload: PasswordResetPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${tokenSignature(encoded)}`;
}

function decodePayload(token: string): PasswordResetPayload | null {
  const [encoded, providedSignature, ...extra] = token.trim().split(".");
  if (!encoded || !providedSignature || extra.length) return null;

  const expectedSignature = tokenSignature(encoded);
  const provided = Buffer.from(providedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PasswordResetPayload;
    if (
      payload?.v !== 1 ||
      typeof payload.uid !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.pwd !== "string"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function assertNewPassword(password: string) {
  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    throw new PasswordRecoveryError(
      "invalid_password",
      `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`,
    );
  }
}

function buildResetLink(token: string) {
  const url = new URL("/reset-password", getEnv().appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function requestPasswordReset(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  const gmail = await primaryGmailConnection();
  if (!gmail?.is_active) {
    throw new PasswordRecoveryError(
      "delivery_unavailable",
      "Рабочая почта CRM сейчас не подключена. Обратитесь к владельцу системы.",
    );
  }

  const now = Date.now();
  const previous = lastResetRequestAt.get(email) || 0;
  if (now - previous < REQUEST_COOLDOWN_MS) {
    return { accepted: true };
  }
  lastResetRequestAt.set(email, now);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.is_active) {
    // Always return the same successful result so this endpoint does not reveal
    // whether a particular employee email exists in the CRM.
    return { accepted: true };
  }

  const token = encodePayload({
    v: 1,
    uid: user.user_id,
    email: user.email,
    exp: now + RESET_TOKEN_TTL_MS,
    pwd: passwordFingerprint(user.password_hash),
  });
  const link = buildResetLink(token);

  try {
    await sendPrimaryGmail({
      to: user.email,
      subject: "ROLANPRO CRM — восстановление пароля",
      body: [
        `Здравствуйте, ${user.full_name}.`,
        "",
        "Получен запрос на восстановление пароля для ROLANPRO CRM.",
        "Откройте ссылку ниже и задайте новый пароль:",
        link,
        "",
        "Ссылка действует 30 минут и перестанет работать сразу после смены пароля.",
        "Если вы не запрашивали восстановление, просто проигнорируйте это письмо.",
      ].join("\n"),
    });
  } catch (error) {
    console.error("[Password recovery] email delivery failed", error);
    throw new PasswordRecoveryError(
      "delivery_unavailable",
      "Не удалось отправить письмо восстановления. Попробуйте позже или обратитесь к владельцу системы.",
    );
  }

  return { accepted: true };
}

export async function resetPasswordWithToken(token: string, password: string) {
  assertNewPassword(password);
  const payload = decodePayload(token);
  if (!payload || payload.exp <= Date.now()) {
    throw new PasswordRecoveryError(
      "invalid_token",
      "Ссылка восстановления недействительна или уже истекла. Запросите новую ссылку.",
    );
  }

  const user = await prisma.user.findUnique({ where: { user_id: payload.uid } });
  if (
    !user?.is_active ||
    user.email !== payload.email ||
    passwordFingerprint(user.password_hash) !== payload.pwd
  ) {
    throw new PasswordRecoveryError(
      "invalid_token",
      "Ссылка восстановления недействительна или уже использована. Запросите новую ссылку.",
    );
  }

  await prisma.user.update({
    where: { user_id: user.user_id },
    data: {
      password_hash: hashPassword(password.trim()),
      must_change_password: false,
    },
  });

  return { email: user.email };
}
