import type { NextRequest } from "next/server";

import type { RoleCode } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hasAnyRole } from "@/lib/auth/rbac";
import { PREVIEW_COOKIE, isPreviewWriteAllowed, resolvePreviewSession, type PreviewInfo } from "@/lib/auth/preview";
import { sessionMatchesCurrentCredentials, verifySessionToken, type SessionPayload } from "@/lib/auth/session";
import { INTEGRATION_KEY_PREFIX, assistantKeyOwnerId, integrationKeyFromHeaders } from "@/features/integrations/api-keys";

/**
 * The signed-in user, ignoring "view as employee". Use only where the real
 * actor matters (starting or stopping a preview).
 */
export async function getRealRequestSession(request: NextRequest) {
  const token = request.cookies.get(getEnv().sessionCookieName)?.value;

  if (!token) {
    return assistantKeySession(request);
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
    viaApiKey: false,
  };
}

const userWithRoles = {
  user_accesses: { where: { is_active: true, role: { is_active: true } }, include: { role: true } },
} as const;

/**
 * A request from the owner's assistant bot: «Authorization: Bearer rpk_…» with the
 * active assistant key acts as the owner who issued it (Owner, 2026-11-22).
 */
async function assistantKeySession(request: NextRequest) {
  const key = integrationKeyFromHeaders(request.headers);
  if (!key.startsWith(INTEGRATION_KEY_PREFIX)) return null;
  const ownerId = await assistantKeyOwnerId(key);
  if (!ownerId) return null;
  const user = await prisma.user.findUnique({ where: { user_id: ownerId }, include: userWithRoles });
  if (!user || !user.is_active) return null;
  const roles = user.user_accesses.map((access) => access.role.code);
  if (!roles.includes("OWNER")) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub: user.user_id, email: user.email, roles, pwd: "", iat: now, exp: now + 60 };
  return { user, roles, payload, preview: null as PreviewInfo | null, viaApiKey: true };
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
