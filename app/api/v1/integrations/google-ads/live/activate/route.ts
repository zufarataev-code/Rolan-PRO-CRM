import { NextRequest } from "next/server";

import {
  GoogleAdsLiveActivationError,
  activateGoogleAdsLiveUploads,
} from "@/features/google-ads/live-activation";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

type LiveActivationBody = {
  confirmation?: unknown;
  customer_id?: unknown;
};

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Google Ads live activation is owner-only.",
    );
  }

  const body = (await request.json().catch(() => null)) as LiveActivationBody | null;
  if (!body || typeof body !== "object") {
    return apiError(400, "invalid_body", "A JSON request body is required.");
  }
  if (typeof body.confirmation !== "string" || typeof body.customer_id !== "string") {
    return apiError(400, "confirmation_required", "confirmation and customer_id are required.");
  }

  try {
    const result = await activateGoogleAdsLiveUploads({
      confirmation: body.confirmation,
      customerId: body.customer_id,
    });
    return apiSuccess({
      customer_id: result.customerId,
      upload_enabled: result.uploadEnabled,
      validate_only: result.validateOnly,
      requeued_validated: result.requeued,
    });
  } catch (cause) {
    if (cause instanceof GoogleAdsLiveActivationError) {
      return apiError(400, cause.code, cause.message);
    }
    throw cause;
  }
}
