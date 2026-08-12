import { NextRequest } from "next/server";

import { getTwilioPublicStatus } from "@/features/twilio/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "Authentication is required.");
  return apiSuccess(getTwilioPublicStatus());
}
