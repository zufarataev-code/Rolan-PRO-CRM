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
    fullName?: string;
    roles?: RoleCode[];
    isActive?: boolean;
    password?: string;
  } | null;

  if (!body) {
    return apiError(400, "invalid_input", "Пустой запрос.");
  }

  try {
    if (body.password) {
      const result = await setTeamMemberPassword(userId, body.password);
      return apiSuccess(result);
    }

    const result = await updateTeamMember(userId, {
      fullName: body.fullName,
      roles: body.roles,
      isActive: body.isActive,
    });

    return apiSuccess(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обновить сотрудника.";
    return apiError(400, "update_failed", message);
  }
}
