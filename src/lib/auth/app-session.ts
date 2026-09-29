import { cookies } from "next/headers";

import type { RoleCode } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hasAnyRole } from "@/lib/auth/rbac";
import { PREVIEW_COOKIE, resolvePreviewSession, type PreviewInfo } from "@/lib/auth/preview";
import { sessionMatchesCurrentCredentials, verifySessionToken } from "@/lib/auth/session";

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

  if (
    !user ||
    !user.is_active ||
    !sessionMatchesCurrentCredentials(payload, user.email, user.password_hash)
  ) {
    return null;
  }

  const session = {
    user,
    roles: user.user_accesses.map((access) => access.role.code),
    payload,
    preview: null as PreviewInfo | null,
  };

  // Server-rendered pages follow the same "view as employee" rule as the API.
  const previewed = await resolvePreviewSession(session, cookieStore.get(PREVIEW_COOKIE)?.value);
  return previewed ?? session;
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
