import { decryptBankSecret, encryptBankSecret } from "@/features/bank/crypto";
import { prisma } from "@/lib/db";

/**
 * Google access for Data Manager API: a Google Cloud service account. The owner
 * creates it, downloads the JSON key and pastes it in CRM → Settings →
 * Integrations → Google Ads; then adds the service-account email as a user of
 * the Google Ads account. The private key never comes back to the browser.
 */
export type ServiceAccount = { email: string; privateKey: string };

export class GoogleCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleCredentialsError";
  }
}

export function parseServiceAccountJson(input: unknown): ServiceAccount {
  let data: Record<string, unknown> | null = null;
  try {
    data = typeof input === "string" ? JSON.parse(input) : (input as Record<string, unknown>);
  } catch {
    throw new GoogleCredentialsError("Это не JSON-ключ. Вставьте содержимое файла ключа сервисного аккаунта целиком.");
  }
  if (!data || typeof data !== "object") throw new GoogleCredentialsError("Пустой ключ.");
  if (data.type !== "service_account") throw new GoogleCredentialsError("Нужен ключ сервисного аккаунта (type: service_account).");
  const email = typeof data.client_email === "string" ? data.client_email.trim() : "";
  const privateKey = typeof data.private_key === "string" ? data.private_key.replace(/\\n/g, "\n").trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(email)) throw new GoogleCredentialsError("В ключе нет client_email сервисного аккаунта.");
  if (!privateKey.includes("BEGIN PRIVATE KEY")) throw new GoogleCredentialsError("В ключе нет private_key.");
  return { email, privateKey };
}

function envServiceAccount(): ServiceAccount | null {
  const email = process.env.GOOGLE_ADS_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_ADS_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return email && privateKey ? { email, privateKey } : null;
}

function envRefreshTokenPresent() {
  return Boolean(
    process.env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN?.trim(),
  );
}

export async function getStoredServiceAccount(): Promise<ServiceAccount | null> {
  try {
    const row = await prisma.googleAdsCredentials.findUnique({ where: { settings_id: "primary" } });
    return row ? { email: row.service_account_email, privateKey: decryptBankSecret(row.private_key_encrypted) } : null;
  } catch {
    return null;
  }
}

/** Server env first, then what the owner saved in CRM. */
export async function resolveServiceAccount(): Promise<ServiceAccount | null> {
  return envServiceAccount() ?? (await getStoredServiceAccount());
}

export async function hasAnyGoogleCredentials() {
  return envRefreshTokenPresent() || Boolean(envServiceAccount()) || Boolean(await getStoredServiceAccount());
}

export async function googleCredentialSummary() {
  if (envRefreshTokenPresent()) return { configured: true, source: "env_oauth" as const, service_account_email: null };
  const env = envServiceAccount();
  if (env) return { configured: true, source: "env_service_account" as const, service_account_email: env.email };
  const row = await prisma.googleAdsCredentials.findUnique({ where: { settings_id: "primary" }, select: { service_account_email: true, updated_at: true } }).catch(() => null);
  return row
    ? { configured: true, source: "crm" as const, service_account_email: row.service_account_email, updated_at: row.updated_at }
    : { configured: false, source: null, service_account_email: null };
}

export async function saveServiceAccount(input: unknown, userId: string) {
  const account = parseServiceAccountJson(input);
  const data = { service_account_email: account.email, private_key_encrypted: encryptBankSecret(account.privateKey), updated_by: userId };
  await prisma.googleAdsCredentials.upsert({ where: { settings_id: "primary" }, update: data, create: { settings_id: "primary", ...data } });
  const { clearGoogleAccessTokenCache } = await import("./oauth");
  clearGoogleAccessTokenCache();
  return googleCredentialSummary();
}

export async function clearServiceAccount() {
  await prisma.googleAdsCredentials.deleteMany({ where: { settings_id: "primary" } });
  const { clearGoogleAccessTokenCache } = await import("./oauth");
  clearGoogleAccessTokenCache();
  return googleCredentialSummary();
}
