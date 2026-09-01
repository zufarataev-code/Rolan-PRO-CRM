import { NextRequest } from "next/server";

import { requireRequestSession } from "@/lib/auth/server";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCredentialFingerprint } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request);

  if (!auth.ok) {
    return apiError(401, "unauthorized", "Authentication is required.");
  }

  const body = (await request.json().catch(() => null)) as
    | { password?: string }
    | null;
  const password = body?.password ?? "";

  if (password.length < 12) {
    return apiError(400, "weak_password", "Password must contain at least 12 characters.");
  }

  const newPasswordHash = hashPassword(password);
  const user = await prisma.user.update({
    where: { user_id: auth.session.user.user_id },
    data: {
      password_hash: newPasswordHash,
      must_change_password: false,
    },
  });

  const response = apiSuccess({ password_changed: true, roles: auth.session.roles });
  response.cookies.set({
    name: getEnv().sessionCookieName,
    value: createSessionToken({
      sub: user.user_id,
      email: user.email,
      roles: auth.session.roles,
      pwd: sessionCredentialFingerprint(newPasswordHash),
    }),
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().nodeEnv === "production",
    path: "/",
    maxAge: getEnv().sessionTtlHours * 60 * 60,
  });

  return response;
}
