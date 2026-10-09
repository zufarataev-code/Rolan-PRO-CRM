export const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1";
export const DEFAULT_REALTIME_VOICE = "marin";

export class OpenAIRealtimeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OpenAIRealtimeError";
  }
}

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function createRealtimeClientSecret(input: {
  apiKey: string;
  safetyIdentifier: string;
  crmContext?: unknown;
  model?: string;
  fetchImpl?: typeof fetch;
}) {
  const apiKey = input.apiKey.trim();
  if (!apiKey.startsWith("sk-")) {
    throw new OpenAIRealtimeError(503, "voice_not_configured", "Голосовой агент ещё не подключён на сервере CRM.");
  }

  const crmContext = safeText(input.crmContext, 30_000);
  const model = safeText(input.model, 100) || DEFAULT_REALTIME_MODEL;
  const instructions = [
    "Ты — голосовой агент Rolan PRO внутри CRM компании по установке плёнок на стекло в Южной Калифорнии.",
    "Говори естественно, кратко и дружелюбно. Отвечай на языке пользователя.",
    "Различай Solar, Smart, Safety и Decorative film. Не выдумывай цены, наличие, клиентов или статусы.",
    "Используй только CRM-контекст, доступный текущему сотруднику.",
    "Не утверждай, что изменил запись, деньги, график или клиента. Для любого изменения сначала кратко повтори действие и попроси явное подтверждение.",
    crmContext ? `Текущий CRM-контекст:\n${crmContext}` : "Текущий CRM-контекст не передан.",
  ].join("\n");

  const response = await (input.fetchImpl ?? fetch)("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": input.safetyIdentifier,
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 60 },
      session: {
        type: "realtime",
        model,
        instructions,
        audio: {
          input: { transcription: { model: "gpt-4o-mini-transcribe" } },
          output: { voice: DEFAULT_REALTIME_VOICE },
        },
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { value?: unknown; error?: { code?: unknown; message?: unknown } }
    | null;
  if (!response.ok || typeof payload?.value !== "string") {
    const code = safeText(payload?.error?.code, 120) || "voice_session_failed";
    const message = safeText(payload?.error?.message, 500) || "Не удалось начать голосовой разговор.";
    throw new OpenAIRealtimeError(response.status || 502, code, message);
  }

  return { value: payload.value, model, voice: DEFAULT_REALTIME_VOICE };
}
