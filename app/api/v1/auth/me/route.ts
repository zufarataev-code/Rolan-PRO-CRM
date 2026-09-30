import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireRequestSession } from "@/lib/auth/server";
import { ensureLegacyIdentity } from "@/features/team/directory";

export async function GET(request: NextRequest) {
  const result = await requireRequestSession(request);

  if (!result.ok) {
    return apiError(401, "unauthorized", "Authentication is required.");
  }

  const { user } = result.session;
  // The legacy CRM resolves the employee by these ids; never return none.
  const legacyUserIds = await ensureLegacyIdentity(user, result.session.roles, {
    persist: !result.session.preview,
  });

  return apiSuccess({
    user: {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      roles: result.session.roles,
      last_login_at: user.last_login_at,
      must_change_password: result.session.preview ? false : user.must_change_password,
      legacy_user_ids: legacyUserIds,
    },
    // Set while the owner views the CRM as this employee (read-only).
    preview: result.session.preview ?? null,
  });
}
