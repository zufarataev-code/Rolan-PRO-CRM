import { NextRequest } from "next/server";

import { PasskeyError, beginPasskeyLogin, passkeyRelyingParty, setPasskeyChallenge } from "@/features/auth/passkeys";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  try {
    const relyingParty = passkeyRelyingParty(request);
    const options = await beginPasskeyLogin(relyingParty);
    const response = apiSuccess({ options });
    setPasskeyChallenge(response, { purpose: "login", challenge: options.challenge, rpId: relyingParty.rpId });
    return response;
  } catch (error) {
    if (error instanceof PasskeyError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }
}
