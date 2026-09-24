import { apiError } from "@/lib/http/api-response";

import {
  FacebookMessengerIntegrationError,
  getFacebookMessengerSharedSecret,
  verifyFacebookMessengerSignature,
} from "./facebook-messenger";

const MAX_BODY_BYTES = 64 * 1024;

export async function readSignedFacebookMessengerJson(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new FacebookMessengerIntegrationError(
      415,
      "unsupported_media_type",
      "Content-Type must be application/json.",
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new FacebookMessengerIntegrationError(
      413,
      "payload_too_large",
      "Request body is too large.",
    );
  }

  const rawBody = await request.text();
  const bodyBytes = new TextEncoder().encode(rawBody).byteLength;

  if (bodyBytes > MAX_BODY_BYTES) {
    throw new FacebookMessengerIntegrationError(
      413,
      "payload_too_large",
      "Request body is too large.",
    );
  }

  const secret = getFacebookMessengerSharedSecret();
  if (!secret) {
    throw new FacebookMessengerIntegrationError(
      503,
      "integration_not_configured",
      "Facebook Messenger integration secret is not configured.",
    );
  }

  const timestamp = request.headers.get("x-rolanpro-timestamp");
  const signature = request.headers.get("x-rolanpro-signature");
  if (
    !verifyFacebookMessengerSignature({
      rawBody,
      timestamp,
      signature,
      secret,
    })
  ) {
    throw new FacebookMessengerIntegrationError(
      401,
      "invalid_signature",
      "Request signature is invalid.",
    );
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new FacebookMessengerIntegrationError(
      400,
      "invalid_json",
      "Request body must be valid JSON.",
    );
  }
}

export function facebookMessengerIntegrationErrorResponse(error: unknown) {
  if (error instanceof FacebookMessengerIntegrationError) {
    return apiError(error.status, error.code, error.message, error.meta);
  }

  console.error("[Facebook Messenger integration] Unexpected error", error);
  return apiError(
    500,
    "integration_failed",
    "Facebook Messenger integration request failed.",
  );
}
