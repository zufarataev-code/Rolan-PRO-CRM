import { NextRequest } from "next/server";

import { setTeamMemberPassword, updateTeamMember } from "@/features/team/service";
import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const TEAM_ADMIN_ROLES = [ROLE_CODES.OWNER];

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRequestSession(request, TEAM_ADMIN_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Team access denied.");
  }

  const { userId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    fullName?: string;
    roles?: RoleCode[];
    isActive?: boolean;
    password?: string;
  } | null;

  if (!body) {
    return apiError(400, "invalid_input", "Пустой запрос.");
  }

  try {
    // Profile fields and password can be changed in one request.
    // The password is never returned by the server except as the one-time
    // temporary value from setTeamMemberPassword.
    let profileResult: { userId: string; email: string } | null = null;
    if (
      body.email !== undefined ||
      body.fullName !== undefined ||
      body.roles !== undefined ||
      body.isActive !== undefined
    ) {
      profileResult = await updateTeamMember(userId, {
        email: body.email,
        fullName: body.fullName,
        roles: body.roles,
        isActive: body.isActive,
      });
    }

    if (body.password) {
      const passwordResult = await setTeamMemberPassword(userId, body.password);
      return apiSuccess({
        ...(profileResult ?? { userId }),
        temporaryPassword: passwordResult.temporaryPassword,
      });
    }

    if (profileResult) {
      return apiSuccess(profileResult);
    }

    return apiError(400, "invalid_input", "Нет изменений для сохранения.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обновить сотрудника.";
    return apiError(400, "update_failed", message);
  }
}
