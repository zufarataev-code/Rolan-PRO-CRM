import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { NextRequest } from "next/server";

import { cleanPasskeyDeviceName, describePasskeyDevice } from "@/features/auth/passkey-core";
import {
  PasskeyError,
  clearPasskeyChallenge,
  finishPasskeyRegistration,
  passkeyRelyingParty,
  readPasskeyChallenge,
} from "@/features/auth/passkeys";
import { PREVIEW_COOKIE } from "@/lib/auth/preview-edge";
import { getRealRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const session = await getRealRequestSession(request);
  if (!session) {
    return apiError(401, "unauthorized", "Authentication is required.");
  }
  if (request.cookies.get(PREVIEW_COOKIE)?.value) {
    return apiError(403, "preview_read_only", "Просмотр глазами сотрудника — только чтение.");
  }
  if (session.user.must_change_password) {
    return apiError(403, "password_change_required", "Сначала смените временный пароль.");
  }

  const body = (await request.json().catch(() => null)) as
    | { response?: RegistrationResponseJSON; device_name?: unknown }
    | null;

  try {
    if (!body?.response || typeof body.response !== "object") {
      throw new PasskeyError(400, "invalid_payload", "Пустой запрос.");
    }

    const relyingParty = passkeyRelyingParty(request);
    const expectedChallenge = readPasskeyChallenge(request, {
      purpose: "register",
      rpId: relyingParty.rpId,
      userId: session.user.user_id,
    });
    const passkey = await finishPasskeyRegistration({
      userId: session.user.user_id,
      relyingParty,
      expectedChallenge,
      response: body.response,
      deviceName: cleanPasskeyDeviceName(body.device_name, describePasskeyDevice(request.headers.get("user-agent"))),
    });

    const response = apiSuccess({ passkey });
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
