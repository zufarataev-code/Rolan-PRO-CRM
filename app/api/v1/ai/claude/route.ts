import { NextRequest } from "next/server";

import {
  AnthropicRequestError,
  parseAnthropicRequest,
  requestAnthropicMessage,
  resolveAnthropicModel,
} from "@/lib/anthropic/client";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const AI_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;

function serverConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const model = resolveAnthropicModel(process.env.ANTHROPIC_DEFAULT_MODEL);
  return { apiKey, model, configured: apiKey.startsWith("sk-ant-") };
}

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, AI_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "AI assistant access is denied.");
  }

  const config = serverConfig();
  return apiSuccess({ configured: config.configured, model: config.model });
}

export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, AI_ROLES);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "AI assistant access is denied.");
  }

  const config = serverConfig();
  if (!config.configured) {
    return apiError(503, "ai_not_configured", "AI assistant is not configured on the CRM server.");
  }

  try {
    const rawBody = await request.json();
    const aiRequest = parseAnthropicRequest({
      ...(rawBody && typeof rawBody === "object" ? rawBody : {}),
      model:
        rawBody && typeof rawBody === "object" && "model" in rawBody
          ? (rawBody as Record<string, unknown>).model
          : config.model,
    });
    const text = await requestAnthropicMessage(config.apiKey, aiRequest);
    return apiSuccess({ text, model: aiRequest.model });
  } catch (error) {
    if (error instanceof AnthropicRequestError) {
      return apiError(error.status, error.code, error.message);
    }
    if (error instanceof SyntaxError) {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
    return apiError(502, "ai_unavailable", "AI assistant is temporarily unavailable.");
  }
}
