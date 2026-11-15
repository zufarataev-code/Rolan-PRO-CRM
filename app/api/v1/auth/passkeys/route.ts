import { NextRequest } from "next/server";

import { listPasskeys } from "@/features/auth/passkeys";
import { getRealRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Devices on which the signed-in employee has enabled Face ID / Touch ID. */
export async function GET(request: NextRequest) {
  // Always the real actor: "view as employee" must not expose or manage the
  // employee's keys.
  const session = await getRealRequestSession(request);
  if (!session) {
    return apiError(401, "unauthorized", "Authentication is required.");
  }

  return apiSuccess({ passkeys: await listPasskeys(session.user.user_id) });
}
