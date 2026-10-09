import { createHash } from "node:crypto";

import { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import {
  createRealtimeClientSecret,
  DEFAULT_REALTIME_MODEL,
  OpenAIRealtimeError,
} from "@/lib/openai/realtime";

const VOICE_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, VOICE_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Voice agent access is denied.");
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { context?: unknown };
    const safetyIdentifier = createHash("sha256")
      .update(`rolanpro:${auth.session.user.user_id}`)
      .digest("hex");
    const session = await createRealtimeClientSecret({
      apiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
      safetyIdentifier,
      crmContext: body.context,
      model: process.env.OPENAI_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL,
    });
    return apiSuccess(session);
  } catch (error) {
    if (error instanceof OpenAIRealtimeError) {
      return apiError(error.status, error.code, error.message);
    }
    return apiError(502, "voice_unavailable", "Голосовой агент временно недоступен.");
  }
}
