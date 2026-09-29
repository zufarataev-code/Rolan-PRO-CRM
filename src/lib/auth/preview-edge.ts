/** Edge-safe part of "view as employee" (no database access). See preview.ts. */

export const PREVIEW_COOKIE = "rolanpro_preview_as";
export const PREVIEW_TTL_SECONDS = 60 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Запросы, разрешённые во время просмотра: выход из просмотра и выход из CRM. */
const PREVIEW_WRITE_ALLOWLIST = ["/api/v1/team/preview", "/api/v1/auth/logout"];

export function isPreviewWriteAllowed(method: string, pathname: string) {
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "HEAD" || upper === "OPTIONS") {
    return true;
  }
  return PREVIEW_WRITE_ALLOWLIST.some((path) => pathname === path);
}

export function isValidPreviewTarget(value: string | undefined | null): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}
