// Health probe for the production watcher (deploy/watch-production.sh) and the
// deploy workflow. It answers without a session and reveals nothing but
// whether the server and its database respond.

export type HealthResult = { status: 200 | 503; body: { ok: boolean } };

export const HEALTH_DATABASE_TIMEOUT_MS = 3000;

export async function checkHealth(
  pingDatabase: () => Promise<unknown>,
  timeoutMs = HEALTH_DATABASE_TIMEOUT_MS,
): Promise<HealthResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pingDatabase(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("database ping timed out")), timeoutMs);
      }),
    ]);
    return { status: 200, body: { ok: true } };
  } catch {
    return { status: 503, body: { ok: false } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
