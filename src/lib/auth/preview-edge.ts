/** Edge-safe part of "view as employee" (no database access). See preview.ts. */

export const PREVIEW_COOKIE = "rolanpro_preview_as";
export const PREVIEW_TTL_SECONDS = 60 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Запросы, разрешённые во время просмотра: выход из просмотра, выход из CRM
 * и новый вход (он сам сбрасывает просмотр).
 */
const PREVIEW_WRITE_ALLOWLIST = ["/api/v1/team/preview", "/api/v1/auth/logout", "/api/v1/auth/login"];

/**
 * Some GET routes have side effects (OAuth callbacks that store credentials,
 * mailbox syncs, logins). HTTP verb alone is not a safe signal, so these are
 * refused during a preview regardless of method.
 */
const PREVIEW_BLOCKED_PREFIXES = [
  "/api/v1/integrations/",
  "/api/v1/auth/demo-login",
  "/api/v1/auth/change-password",
  "/api/v1/auth/reset-password",
  "/api/v1/auth/forgot-password",
];
const PREVIEW_BLOCKED_SEGMENT = /(^|\/)(callback|connect|oauth|sync|cron|webhooks?)(\/|$)/i;

export function isPreviewWriteAllowed(method: string, pathname: string) {
  if (PREVIEW_WRITE_ALLOWLIST.includes(pathname)) {
    return true;
  }
  if (PREVIEW_BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || PREVIEW_BLOCKED_SEGMENT.test(pathname)) {
    return false;
  }
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "HEAD" || upper === "OPTIONS";
}

export function isValidPreviewTarget(value: string | undefined | null): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}
