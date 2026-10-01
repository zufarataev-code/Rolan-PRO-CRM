import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export const dynamic = "force-dynamic";

/**
 * E2E safety handshake. Exists only on a server started with
 * E2E_ALLOW_WRITES=1 (never set in production). The E2E gate compares this
 * database identity with its own connection before it writes anything, so a
 * test can never write through a server that uses a different database.
 */
export async function GET() {
  if (process.env.E2E_ALLOW_WRITES !== "1") {
    return apiError(404, "not_found", "Not found.");
  }
  const [identity] = await prisma.$queryRaw<Array<{ database: string; started: Date; disposable: boolean }>>`
    SELECT current_database() AS database,
           pg_postmaster_start_time() AS started,
           to_regclass('public.e2e_disposable_marker') IS NOT NULL AS disposable
  `;
  return apiSuccess({
    database: identity.database,
    started: identity.started.toISOString(),
    // Only databases created for tests carry this marker table (see ci.yml).
    disposable: identity.disposable,
  });
}
