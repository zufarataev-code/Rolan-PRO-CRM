import { cookies } from "next/headers";

import type { RoleCode } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hasAnyRole } from "@/lib/auth/rbac";
import { verifySessionToken } from "@/lib/auth/session";

export async function getAppSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getEnv().sessionCookieName)?.value;

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

export async function requireAppSession(requiredRoles?: readonly RoleCode[]) {
  const session = await getAppSession();

  if (!session) {
    return null;
  }

  if (requiredRoles && !hasAnyRole(session.roles, requiredRoles)) {
    return null;
  }

  return session;
}
