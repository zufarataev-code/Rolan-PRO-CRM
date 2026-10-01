import type { NextRequest } from "next/server";

import type { RoleCode } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hasAnyRole } from "@/lib/auth/rbac";
import { PREVIEW_COOKIE, isPreviewWriteAllowed, resolvePreviewSession, type PreviewInfo } from "@/lib/auth/preview";
import { sessionMatchesCurrentCredentials, verifySessionToken } from "@/lib/auth/session";

/**
 * The signed-in user, ignoring "view as employee". Use only where the real
 * actor matters (starting or stopping a preview).
 */
export async function getRealRequestSession(request: NextRequest) {
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

  if (
    !user ||
    !user.is_active ||
    !sessionMatchesCurrentCredentials(payload, user.email, user.password_hash)
  ) {
    return null;
  }

  return {
    user,
    roles: user.user_accesses.map((access) => access.role.code),
    payload,
    preview: null as PreviewInfo | null,
  };
}

/**
 * The session every request is served with. While the owner previews an
 * employee, this is the employee's session (read-only, see preview.ts).
 */
export async function getRequestSession(request: NextRequest) {
  const session = await getRealRequestSession(request);
  if (!session) {
    return null;
  }

  const previewed = await resolvePreviewSession(session, request.cookies.get(PREVIEW_COOKIE)?.value);
  return previewed ?? session;
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

  if (session.preview && !isPreviewWriteAllowed(request.method, request.nextUrl.pathname)) {
    return {
      ok: false as const,
      reason: "forbidden",
      session,
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
