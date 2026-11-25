import type { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError } from "@/lib/http/api-response";

/** Employees who can turn pushes on: everyone but the AI service account. */
export const PUSH_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER, ROLE_CODES.CONSULTANT, ROLE_CODES.INSTALLER] as const;

/** A real employee's own session: no "view as employee" preview and no API key. */
export async function requirePushSession(request: NextRequest) {
  const auth = await requireRequestSession(request, PUSH_ROLES);
  if (!auth.ok) {
    return { ok: false as const, response: apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Push notifications are not available for this session.") };
  }
  if (auth.session.preview || ("viaApiKey" in auth.session && auth.session.viaApiKey)) {
    return { ok: false as const, response: apiError(403, "forbidden", "Push notifications are only set up from the employee's own device.") };
  }
  return { ok: true as const, session: auth.session };
}
