import { NextRequest } from "next/server";

import { createTeamMember, listTeamMembers } from "@/features/team/service";
import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Заводить и просматривать сотрудников может только владелец. */
const TEAM_ADMIN_ROLES = [ROLE_CODES.OWNER];

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, TEAM_ADMIN_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Team access denied.");
  }

  return apiSuccess(await listTeamMembers());
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, TEAM_ADMIN_ROLES);

  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Team access denied.");
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    fullName?: string;
    roles?: RoleCode[];
    password?: string;
  } | null;

  if (!body?.email || !body.fullName || !body.roles?.length || !body.password) {
    return apiError(400, "invalid_input", "Нужны почта, имя, роли и пароль.");
  }

  try {
    const created = await createTeamMember({
      email: body.email,
      fullName: body.fullName,
      roles: body.roles,
      password: body.password,
    });

    return apiSuccess(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать сотрудника.";
    return apiError(400, "create_failed", message);
  }
}
