import { NextRequest } from "next/server";

import {
  PasskeyError,
  beginPasskeyRegistration,
  passkeyRelyingParty,
  setPasskeyChallenge,
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

  try {
    const relyingParty = passkeyRelyingParty(request);
    const options = await beginPasskeyRegistration(session.user, relyingParty);
    const response = apiSuccess({ options });
    setPasskeyChallenge(response, {
      purpose: "register",
      challenge: options.challenge,
      rpId: relyingParty.rpId,
      userId: session.user.user_id,
    });
    return response;
  } catch (error) {
    if (error instanceof PasskeyError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }
}
