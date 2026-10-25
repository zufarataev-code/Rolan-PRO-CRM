import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/db";

/**
 * Owner, 2026-10-25: «сделай API ключ нашей CRM, чтобы подключить Google Ads».
 * One active key per integration. The key is shown once; the CRM keeps only its
 * SHA-256 hash, so a database copy does not reveal it.
 */
export const INTEGRATION_KEY_PREFIX = "rpk_";
export const INTEGRATIONS = ["google_ads"] as const;
export type IntegrationName = (typeof INTEGRATIONS)[number];

export function isIntegrationName(value: unknown): value is IntegrationName {
  return typeof value === "string" && (INTEGRATIONS as readonly string[]).includes(value);
}

export function hashIntegrationKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function generateIntegrationKey() {
  return `${INTEGRATION_KEY_PREFIX}${randomBytes(30).toString("base64url")}`;
}

/** Bearer token from the Authorization header (or X-Api-Key). */
export function integrationKeyFromHeaders(headers: Headers) {
  const auth = headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return headers.get("x-api-key")?.trim() ?? "";
}

export async function createIntegrationKey(integration: IntegrationName, actorUserId: string | null) {
  const key = generateIntegrationKey();
  const now = new Date();
  // A new key replaces the old one: the old script stops working at once.
  await prisma.$transaction([
    prisma.integrationApiKey.updateMany({ where: { integration, revoked_at: null }, data: { revoked_at: now } }),
    prisma.integrationApiKey.create({
      data: { integration, key_hash: hashIntegrationKey(key), key_prefix: key.slice(0, 10), created_by: actorUserId },
    }),
  ]);
  return { key, key_prefix: key.slice(0, 10), created_at: now.toISOString() };
}

export async function revokeIntegrationKeys(integration: IntegrationName) {
  const result = await prisma.integrationApiKey.updateMany({ where: { integration, revoked_at: null }, data: { revoked_at: new Date() } });
  return { revoked: result.count };
}

export async function integrationKeySummary(integration: IntegrationName) {
  const active = await prisma.integrationApiKey.findFirst({
    where: { integration, revoked_at: null },
    orderBy: { created_at: "desc" },
    select: { key_prefix: true, created_at: true, last_used_at: true },
  });
  return active
    ? { active: true, key_prefix: active.key_prefix, created_at: active.created_at, last_used_at: active.last_used_at }
    : { active: false, key_prefix: null, created_at: null, last_used_at: null };
}

/** The key is valid for this integration and not revoked; marks it used. */
export async function verifyIntegrationKey(integration: IntegrationName, key: string) {
  if (!key.startsWith(INTEGRATION_KEY_PREFIX) || key.length < 30 || key.length > 120) return false;
  const hash = hashIntegrationKey(key);
  const row = await prisma.integrationApiKey.findUnique({ where: { key_hash: hash }, select: { key_id: true, key_hash: true, integration: true, revoked_at: true } });
  if (!row || row.integration !== integration || row.revoked_at) return false;
  if (!timingSafeEqual(Buffer.from(row.key_hash, "utf8"), Buffer.from(hash, "utf8"))) return false;
  await prisma.integrationApiKey.update({ where: { key_id: row.key_id }, data: { last_used_at: new Date() } });
  return true;
}
