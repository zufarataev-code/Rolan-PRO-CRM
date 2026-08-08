import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireRequestSession } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const result = await requireRequestSession(request);

  if (!result.ok) {
    return apiError(401, "unauthorized", "Authentication is required.");
  }

  const { user } = result.session;

  return apiSuccess({
    user: {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      roles: result.session.roles,
      last_login_at: user.last_login_at,
      must_change_password: user.must_change_password,
      legacy_user_ids: user.legacy_user_ids,
    },
  });
}
