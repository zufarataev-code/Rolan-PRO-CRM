import type { NextRequest } from "next/server";

import type { RoleCode } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hasAnyRole } from "@/lib/auth/rbac";
import { verifySessionToken } from "@/lib/auth/session";

export async function getRequestSession(request: NextRequest) {
  const token = request.cookies.get(getEnv().sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token);

  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      user_id: payload.sub,
    },
    include: {
      user_accesses: {
        where: {
          is_active: true,
          role: {
            is_active: true,
          },
        },
        include: {
          role: true,
        },
      },
    },
  });

  if (!user || !user.is_active) {
    return null;
  }

  return {
    user,
    roles: user.user_accesses.map((access) => access.role.code),
    payload,
  };
}

export async function requireRequestSession(
  request: NextRequest,
  requiredRoles?: readonly RoleCode[],
) {
  const session = await getRequestSession(request);

  if (!session) {
    return {
      ok: false as const,
      reason: "unauthorized",
    };
  }

  if (requiredRoles && !hasAnyRole(session.roles, requiredRoles)) {
    return {
      ok: false as const,
      reason: "forbidden",
      session,
    };
  }

  return {
    ok: true as const,
    session,
  };
}
