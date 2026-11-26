import { vapidKeysValid, type VapidKeys } from "./web-push";

/**
 * Pushes are on only when the server has its VAPID keys (see
 * scripts/generate-vapid-keys.mjs). Without them the CRM works exactly as
 * before: no button, no background work, no errors.
 */
export function pushConfig(env: NodeJS.ProcessEnv = process.env): VapidKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  if (!publicKey || !privateKey) return null;
  if (env.PUSH_NOTIFICATIONS === "off") return null;
  const subject = env.VAPID_SUBJECT?.trim() || "mailto:info@rolanpro.com";
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
  const cacheKey = `${publicKey}:${privateKey}`;
  if (validated.key !== cacheKey) validated = { key: cacheKey, ok: vapidKeysValid({ publicKey, privateKey }) };
  if (!validated.ok) return null;
  return { publicKey, privateKey, subject };
}

let validated: { key: string; ok: boolean } = { key: "", ok: false };
