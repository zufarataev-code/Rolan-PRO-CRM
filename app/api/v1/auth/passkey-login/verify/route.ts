import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { NextRequest } from "next/server";

import {
  PasskeyError,
  clearPasskeyChallenge,
  consumePasskeyChallenge,
  finishPasskeyLogin,
  passkeyRelyingParty,
  readPasskeyChallenge,
} from "@/features/auth/passkeys";
import { PREVIEW_COOKIE } from "@/lib/auth/preview-edge";
import { createSessionToken, sessionCredentialFingerprint } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { response?: AuthenticationResponseJSON } | null;

  try {
    if (!body?.response || typeof body.response !== "object") {
      throw new PasskeyError(400, "invalid_payload", "Пустой запрос.");
    }

    const relyingParty = passkeyRelyingParty(request);
    const expectedChallenge = readPasskeyChallenge(request, { purpose: "login", rpId: relyingParty.rpId });
    await consumePasskeyChallenge(expectedChallenge);
    const { user, roles } = await finishPasskeyLogin({ relyingParty, expectedChallenge, response: body.response });

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

    // Same session as a password login. It carries the current password
    // fingerprint, so a later password change still signs this device out of
    // its session — and Face ID signs it back in without typing the password.
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
    // A fresh login never starts inside someone else's preview.
    response.cookies.set({ name: PREVIEW_COOKIE, value: "", path: "/", maxAge: 0 });
    clearPasskeyChallenge(response);
    return response;
  } catch (error) {
    if (error instanceof PasskeyError) {
      const response = apiError(error.status, error.code, error.message);
      clearPasskeyChallenge(response);
      return response;
    }
    throw error;
  }
}
