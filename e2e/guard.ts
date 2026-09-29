/**
 * The E2E gate creates records and clears flags on seeded accounts. It must
 * never run against production, so it requires an explicit opt-in AND checks
 * that both the application URL and the database are local. A hostname
 * blacklist is not enough: production is reachable under several names, and a
 * local server can be pointed at a production database.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostOf(value: string | undefined, label: string) {
  if (!value) throw new Error(`E2E gate: ${label} is not set.`);
  try {
    return new URL(value).hostname;
  } catch {
    throw new Error(`E2E gate: ${label} is not a valid URL.`);
  }
}

export function assertSafeE2eTarget(baseUrl: string) {
  if (process.env.E2E_ALLOW_WRITES !== "1") {
    throw new Error("E2E gate refused: set E2E_ALLOW_WRITES=1 to confirm this is a disposable test database.");
  }
  const appHost = hostOf(baseUrl, "E2E_BASE_URL");
  const dbHost = hostOf(process.env.DATABASE_URL, "DATABASE_URL");
  if (!LOCAL_HOSTS.has(appHost) || !LOCAL_HOSTS.has(dbHost)) {
    throw new Error(`E2E gate refused: app (${appHost}) and database (${dbHost}) must both be local.`);
  }
}
