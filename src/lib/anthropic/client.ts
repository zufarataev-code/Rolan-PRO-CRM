export const ANTHROPIC_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
] as const;

export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];
export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

const DEFAULT_MODEL: AnthropicModel = "claude-haiku-4-5-20251001";
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 32_000;
const MAX_TOTAL_MESSAGE_CHARS = 80_000;
const MAX_SYSTEM_CHARS = 40_000;
const MAX_OUTPUT_TOKENS = 2_000;

export class AnthropicRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function resolveAnthropicModel(value: unknown): AnthropicModel {
  return ANTHROPIC_MODELS.includes(value as AnthropicModel)
    ? (value as AnthropicModel)
    : DEFAULT_MODEL;
}

export function parseAnthropicRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AnthropicRequestError("invalid_request", "Request body must be an object.");
  }

  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new AnthropicRequestError("messages_required", "At least one message is required.");
  }
  if (body.messages.length > MAX_MESSAGES) {
    throw new AnthropicRequestError("too_many_messages", `No more than ${MAX_MESSAGES} messages are allowed.`);
  }

  let totalChars = 0;
  const messages: AnthropicMessage[] = body.messages.map((message, index) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new AnthropicRequestError("invalid_message", `Message ${index + 1} is invalid.`);
    }
    const candidate = message as Record<string, unknown>;
    if (candidate.role !== "user" && candidate.role !== "assistant") {
      throw new AnthropicRequestError("invalid_message_role", `Message ${index + 1} has an invalid role.`);
    }
    if (typeof candidate.content !== "string" || candidate.content.trim().length === 0) {
      throw new AnthropicRequestError("invalid_message_content", `Message ${index + 1} must contain text.`);
    }
    if (candidate.content.length > MAX_MESSAGE_CHARS) {
      throw new AnthropicRequestError("message_too_large", `Message ${index + 1} is too large.`);
    }
    totalChars += candidate.content.length;
    return { role: candidate.role, content: candidate.content };
  });

  if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
    throw new AnthropicRequestError("request_too_large", "The AI request is too large.", 413);
  }

  const system = typeof body.system === "string" ? body.system.trim() : "";
  if (system.length > MAX_SYSTEM_CHARS) {
    throw new AnthropicRequestError("system_prompt_too_large", "The system prompt is too large.", 413);
  }

  const requestedTokens =
    typeof body.max_tokens === "number" && Number.isFinite(body.max_tokens)
      ? Math.floor(body.max_tokens)
      : 1_500;

  return {
    model: resolveAnthropicModel(body.model),
    max_tokens: Math.min(Math.max(requestedTokens, 1), MAX_OUTPUT_TOKENS),
    messages,
    ...(system ? { system } : {}),
  };
}

export async function requestAnthropicMessage(
  apiKey: string,
  request: ReturnType<typeof parseAnthropicRequest>,
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(45_000),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { content?: Array<{ type?: string; text?: string }>; error?: { message?: string } }
    | null;

  if (!response.ok) {
    const message = response.status === 401
      ? "Anthropic rejected the server API key."
      : response.status === 429
        ? "Anthropic rate limit or balance limit was reached."
        : "Anthropic request failed.";
    throw new AnthropicRequestError("anthropic_error", message, response.status >= 500 ? 502 : response.status);
  }

  const text = payload?.content
    ?.filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new AnthropicRequestError("empty_response", "Anthropic returned an empty response.", 502);
  }

  return text;
}
