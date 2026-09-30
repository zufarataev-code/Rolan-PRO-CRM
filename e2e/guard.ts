/**
 * The E2E gate creates records and clears flags on seeded accounts. It must
 * never run against production, so before any write it requires:
 *
 * 1. an explicit opt-in (E2E_ALLOW_WRITES=1) for the test process;
 * 2. a local app URL and a local DATABASE_URL;
 * 3. a handshake proving the running server uses the very same database:
 *    the server exposes /api/v1/e2e/sentinel only when it was itself started
 *    with E2E_ALLOW_WRITES=1, and its database identity must equal the test
 *    process's own connection;
 * 4. proof that this database is disposable: it must contain the
 *    e2e_disposable_marker table, created only for test databases (ci.yml).
 *    A production database reached through a tunnel never has it.
 */
import type { PrismaClient } from "@prisma/client";

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

export async function assertServerUsesTestDatabase(baseUrl: string, prisma: PrismaClient) {
  assertSafeE2eTarget(baseUrl);
  const response = await fetch(`${baseUrl}/api/v1/e2e/sentinel`, { cache: "no-store" });
  if (response.status !== 200) {
    throw new Error("E2E gate refused: the server was not started with E2E_ALLOW_WRITES=1.");
  }
  const server = ((await response.json()) as { data: { database: string; started: string; disposable: boolean } }).data;
  if (!server.disposable) {
    throw new Error("E2E gate refused: the database has no e2e_disposable_marker; it is not a disposable test database.");
  }
  const [local] = await prisma.$queryRaw<Array<{ database: string; started: Date }>>`
    SELECT current_database() AS database, pg_postmaster_start_time() AS started
  `;
  if (server.database !== local.database || server.started !== local.started.toISOString()) {
    throw new Error(
      `E2E gate refused: the server uses database "${server.database}", the test uses "${local.database}".`,
    );
  }
}
