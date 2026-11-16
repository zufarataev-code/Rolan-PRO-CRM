const TELEGRAM_API_ROOT = "https://api.telegram.org";
export const TELEGRAM_TIMEOUT_MS = 15_000;

type TelegramEnvelope<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
};

type TelegramBot = {
  id?: number;
  username?: string;
  first_name?: string;
};

type TelegramMessage = {
  message_id?: number;
};

function serverToken() {
  return (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
}

export function telegramTokenLooksValid(value: string) {
  return /^\d{6,12}:[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

export function telegramChatIdLooksValid(value: unknown) {
  return /^-?\d{5,20}$/.test(String(value ?? "").trim());
}

async function telegramRequest<T>(
  method: "getMe" | "sendMessage",
  body: Record<string, unknown> | null,
  fetchImpl: typeof fetch = fetch,
) {
  const token = serverToken();
  if (!telegramTokenLooksValid(token)) throw new Error("Telegram bot is not configured on the CRM server.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${TELEGRAM_API_ROOT}/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as TelegramEnvelope<T> | null;
    if (!response.ok || !payload?.ok || !payload.result) {
      throw new Error(payload?.description || `Telegram request failed (${response.status}).`);
    }
    return payload.result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Telegram request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getTelegramPublicStatus(fetchImpl: typeof fetch = fetch) {
  if (!telegramTokenLooksValid(serverToken())) {
    return { configured: false, connected: false, bot_username: null, bot_name: null };
  }
  try {
    const bot = await telegramRequest<TelegramBot>("getMe", null, fetchImpl);
    return {
      configured: true,
      connected: true,
      bot_username: bot.username ? `@${bot.username}` : null,
      bot_name: bot.first_name || null,
    };
  } catch {
    return { configured: true, connected: false, bot_username: null, bot_name: null };
  }
}

export async function sendTelegramMessage(
  input: { chatId: unknown; text: unknown },
  fetchImpl: typeof fetch = fetch,
) {
  const chatId = String(input.chatId ?? "").trim();
  const text = String(input.text ?? "").trim();
  if (!telegramChatIdLooksValid(chatId)) throw new Error("Telegram Chat ID is invalid.");
  if (!text || text.length > 4096) throw new Error("Telegram message must contain 1–4096 characters.");
  const message = await telegramRequest<TelegramMessage>("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  }, fetchImpl);
  if (!Number.isInteger(message.message_id)) throw new Error("Telegram did not return a message ID.");
  return { message_id: message.message_id };
}
