import { decryptBankSecret, encryptBankSecret } from "@/features/bank/crypto";
import { prisma } from "@/lib/db";

/**
 * Where the Stripe key comes from (Owner, 2026-10-24: «ключ от Stripe в CRM»).
 * STRIPE_SECRET_KEY on the server wins; otherwise the key the owner saved in
 * CRM settings, stored encrypted (same AES-256-GCM envelope as the bank keys).
 * The key never goes back to the browser — only the mode and the last 4.
 */
export const STRIPE_KEY_PATTERN = /^(sk|rk)_(live|test)_[A-Za-z0-9]{16,247}$/;

export type StripeKeySummary = {
  configured: boolean;
  source: "server" | "crm" | null;
  mode: "live" | "test" | null;
  hint: string | null;
};

function modeOf(key: string): "live" | "test" {
  return key.includes("_live_") ? "live" : "test";
}

export function stripeKeyHint(key: string) {
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

export async function getStripeSecretKey(): Promise<string | null> {
  const fromEnv = process.env.STRIPE_SECRET_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const row = await prisma.stripeSettings.findUnique({ where: { settings_id: "primary" } });
    return row ? decryptBankSecret(row.secret_encrypted) : null;
  } catch (error) {
    console.error("[Payments] Stripe key from CRM settings is unreadable", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function getStripeKeySummary(): Promise<StripeKeySummary> {
  const fromEnv = process.env.STRIPE_SECRET_KEY?.trim();
  if (fromEnv) return { configured: true, source: "server", mode: modeOf(fromEnv), hint: stripeKeyHint(fromEnv) };
  const row = await prisma.stripeSettings.findUnique({ where: { settings_id: "primary" } }).catch(() => null);
  if (!row) return { configured: false, source: null, mode: null, hint: null };
  return { configured: true, source: "crm", mode: row.mode === "live" ? "live" : "test", hint: row.key_hint };
}

export async function saveStripeSecretKey(input: unknown, userId: string) {
  const key = String(input ?? "").trim();
  if (!STRIPE_KEY_PATTERN.test(key)) {
    throw new Error("Это не ключ Stripe. Нужен Secret key (sk_live_…) или Restricted key (rk_live_…) из Stripe → Developers → API keys.");
  }
  if (key.startsWith("pk_")) throw new Error("Это публичный ключ (pk_…). Нужен секретный: sk_… или rk_….");
  const data = { secret_encrypted: encryptBankSecret(key), key_hint: stripeKeyHint(key), mode: modeOf(key), updated_by: userId };
  await prisma.stripeSettings.upsert({ where: { settings_id: "primary" }, create: { settings_id: "primary", ...data }, update: data });
  return getStripeKeySummary();
}

export async function clearStripeSecretKey() {
  await prisma.stripeSettings.deleteMany({ where: { settings_id: "primary" } });
  return getStripeKeySummary();
}
