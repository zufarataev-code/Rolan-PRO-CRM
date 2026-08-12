import { NextRequest } from "next/server";

import { checkVerification } from "@/features/twilio/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "Authentication is required.");
  const body = (await request.json().catch(() => null)) as { to?: unknown; code?: unknown } | null;
  if (typeof body?.to !== "string" || typeof body.code !== "string") {
    return apiError(400, "invalid_payload", "Phone and verification code are required.");
  }
  try {
    return apiSuccess(await checkVerification(body.to, body.code));
  } catch (error) {
    return apiError(502, "twilio_verify_failed", error instanceof Error ? error.message : "Verify failed.");
  }
}
