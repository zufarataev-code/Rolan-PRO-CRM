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

  const currentUser = auth.session.user;
  const observedPasswordHash = currentUser.password_hash;
  const newPasswordHash = hashPassword(password);

  // Compare-and-swap against the exact credentials that were validated for
  // this request. If another password reset/change or email edit wins the race,
  // this request must not overwrite those newer credentials or mint a fresh
  // session for stale authentication state.
  const updated = await prisma.user.updateMany({
    where: {
      user_id: currentUser.user_id,
      email: currentUser.email,
      password_hash: observedPasswordHash,
      is_active: true,
    },
    data: {
      password_hash: newPasswordHash,
      must_change_password: false,
    },
  });

  if (updated.count !== 1) {
    return apiError(
      409,
      "credentials_changed",
      "Your account credentials changed during this request. Sign in again and retry.",
    );
  }

  const response = apiSuccess({ password_changed: true, roles: auth.session.roles });
  response.cookies.set({
    name: getEnv().sessionCookieName,
    value: createSessionToken({
      sub: currentUser.user_id,
      email: currentUser.email,
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
