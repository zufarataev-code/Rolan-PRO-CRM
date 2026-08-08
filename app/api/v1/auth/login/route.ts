import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        email?: string;
        password?: string;
      }
    | null;

  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;

  if (!email || !password) {
    return apiError(400, "invalid_payload", "Email and password are required.");
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
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

  if (!user?.password_hash || !user.is_active) {
    return apiError(401, "invalid_credentials", "Invalid email or password.");
  }

  if (!verifyPassword(password, user.password_hash)) {
    return apiError(401, "invalid_credentials", "Invalid email or password.");
  }

  const roles = user.user_accesses.map((access) => access.role.code);

  if (roles.length === 0) {
    return apiError(403, "access_not_granted", "The user has no active role assignments.");
  }

  await prisma.user.update({
    where: {
      user_id: user.user_id,
    },
    data: {
      last_login_at: new Date(),
    },
  });

  const sessionToken = createSessionToken({
    sub: user.user_id,
    email: user.email,
    roles,
  });

  const response = apiSuccess({
    user: {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      roles,
      must_change_password: user.must_change_password,
      legacy_user_ids: user.legacy_user_ids,
    },
  });

  response.cookies.set({
    name: getEnv().sessionCookieName,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().nodeEnv === "production",
    path: "/",
    maxAge: getEnv().sessionTtlHours * 60 * 60,
  });

  return response;
}
