import assert from "node:assert/strict";
import test from "node:test";

import {
  getTelegramPublicStatus,
  sendTelegramMessage,
  telegramChatIdLooksValid,
  telegramTokenLooksValid,
} from "./service";

const priorToken = process.env.TELEGRAM_BOT_TOKEN;

test.afterEach(() => {
  if (priorToken == null) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = priorToken;
});

test("Telegram validates server tokens and employee chat identifiers", () => {
  assert.equal(telegramTokenLooksValid("123456789:abcdefghijklmnopqrstuvwxyz_123456"), true);
  assert.equal(telegramTokenLooksValid("browser-secret"), false);
  assert.equal(telegramChatIdLooksValid("123456789"), true);
  assert.equal(telegramChatIdLooksValid("-1001234567890"), true);
  assert.equal(telegramChatIdLooksValid("@username"), false);
});

test("Telegram status exposes bot identity without returning the token", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz_123456";
  const status = await getTelegramPublicStatus(async (url) => {
    assert.match(String(url), /\/getMe$/);
    return new Response(JSON.stringify({ ok: true, result: { id: 1, username: "rolanpro_bot", first_name: "Rolan PRO" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.deepEqual(status, { configured: true, connected: true, bot_username: "@rolanpro_bot", bot_name: "Rolan PRO" });
  assert.equal(JSON.stringify(status).includes(process.env.TELEGRAM_BOT_TOKEN), false);
});

test("Telegram messages are sent only by the server adapter", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz_123456";
  let requestBody: Record<string, unknown> | null = null;
  const result = await sendTelegramMessage({ chatId: "-1001234567890", text: "Монтаж назначен" }, async (url, init) => {
    assert.match(String(url), /\/sendMessage$/);
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.deepEqual(requestBody, { chat_id: "-1001234567890", text: "Монтаж назначен", disable_web_page_preview: true });
  assert.deepEqual(result, { message_id: 42 });
});

test("Telegram stays disabled when the protected server token is absent", async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  assert.deepEqual(await getTelegramPublicStatus(), { configured: false, connected: false, bot_username: null, bot_name: null });
  await assert.rejects(() => sendTelegramMessage({ chatId: "123456789", text: "test" }), /not configured/);
});
