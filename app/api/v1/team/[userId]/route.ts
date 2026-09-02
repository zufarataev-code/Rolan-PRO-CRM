import { NextRequest, NextResponse } from "next/server";

import { setTeamMemberPassword, updateTeamMember } from "@/features/team/service";
import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { createSessionToken, sessionCredentialFingerprint } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
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
    legacyUserId?: string;
  } | null;

  if (!body) {
    return apiError(400, "invalid_input", "Пустой запрос.");
  }

  try {
    // Profile fields and password can be changed in one request.
    // legacyUserId is accepted only on this owner-only endpoint and is used
    // to permanently link an old legacy employee card to its PostgreSQL user.
    let profileResult: {
      userId: string;
      email: string;
      legacyUserIds: string[];
    } | null = null;
    if (
      body.email !== undefined ||
      body.fullName !== undefined ||
      body.roles !== undefined ||
      body.isActive !== undefined ||
      body.legacyUserId !== undefined
    ) {
      profileResult = await updateTeamMember(userId, {
        email: body.email,
        fullName: body.fullName,
        roles: body.roles,
        isActive: body.isActive,
        legacyUserId: body.legacyUserId,
      });
    }

    if (body.password) {
      const passwordResult = await setTeamMemberPassword(userId, body.password);
      const response = apiSuccess({
        ...(profileResult ?? { userId }),
        temporaryPassword: passwordResult.temporaryPassword,
      });
      return refreshOwnSessionIfNeeded(response, userId, auth.session.user.user_id);
    }

    if (profileResult) {
      const response = apiSuccess(profileResult);
      return refreshOwnSessionIfNeeded(response, userId, auth.session.user.user_id);
    }

    return apiError(400, "invalid_input", "Нет изменений для сохранения.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обновить сотрудника.";
    return apiError(400, "update_failed", message);
  }
}

async function refreshOwnSessionIfNeeded(response: NextResponse, targetUserId: string, actorUserId: string) {
  if (targetUserId !== actorUserId) return response;

  const user = await prisma.user.findUnique({
    where: { user_id: targetUserId },
    include: {
      user_accesses: {
        where: { is_active: true, role: { is_active: true } },
        include: { role: true },
      },
    },
  });
  if (!user?.is_active) return response;

  const roles = user.user_accesses.map((access) => access.role.code);
  response.cookies.set({
    name: getEnv().sessionCookieName,
    value: createSessionToken({
      sub: user.user_id,
      email: user.email,
      roles,
      pwd: sessionCredentialFingerprint(user.password_hash),
    }),
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().nodeEnv === "production",
    path: "/",
    maxAge: getEnv().sessionTtlHours * 60 * 60,
  });
  return response;
}
