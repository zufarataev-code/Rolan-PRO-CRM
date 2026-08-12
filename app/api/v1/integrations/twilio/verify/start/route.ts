import { NextRequest } from "next/server";

import { startVerification } from "@/features/twilio/service";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "Authentication is required.");
  const body = (await request.json().catch(() => null)) as { to?: unknown } | null;
  if (typeof body?.to !== "string") return apiError(400, "invalid_payload", "Phone is required.");
  try {
    return apiSuccess(await startVerification(body.to));
  } catch (error) {
    return apiError(502, "twilio_verify_failed", error instanceof Error ? error.message : "Verify failed.");
  }
}
