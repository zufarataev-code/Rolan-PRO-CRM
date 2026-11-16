import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const route = readFileSync("app/api/v1/integrations/telegram/messages/route.ts", "utf8");
const exampleEnv = readFileSync(".env.example", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy-production.yml", "utf8");

test("the browser never receives a Telegram bot token or calls Bot API", () => {
  const send = html.slice(html.indexOf("async function sendTelegram("), html.indexOf("function whatsappLink("));
  assert.match(send, /fetch\('\/api\/v1\/integrations\/telegram\/messages'/);
  assert.doesNotMatch(send, /api\.telegram\.org|telegramBotToken|bot\$\{token\}/);
  assert.doesNotMatch(html, /id="set-tg"/);
  assert.doesNotMatch(html, /function saveTelegramToken\(/);
});

test("the server resolves Telegram recipients from the employee directory", () => {
  assert.match(route, /recipient_user_id/);
  assert.match(route, /prisma\.legacyWorkspace\.findUnique/);
  assert.match(route, /String\(user\.id \?\? ""\) === recipientUserId/);
  assert.match(route, /telegramChatId/);
  assert.doesNotMatch(route, /body\?\.chat_id|body\?\.telegramChatId/);
});

test("the Telegram settings panel shows server status and employee Chat IDs", () => {
  assert.match(html, /loadTelegramServerStatus/);
  assert.match(html, /TELEGRAM_BOT_TOKEN/);
  assert.match(html, /Chat ID сотрудников/);
  assert.match(html, /testTelegram\(\)/);
});

test("the production secret is optional, server-only, and retained when not supplied", () => {
  assert.match(exampleEnv, /^TELEGRAM_BOT_TOKEN=""$/m);
  assert.doesNotMatch(exampleEnv, /NEXT_PUBLIC_TELEGRAM/);
  assert.match(deployWorkflow, /TELEGRAM_BOT_TOKEN: \$\{\{ secrets\.TELEGRAM_BOT_TOKEN \}\}/);
  assert.match(deployWorkflow, /Telegram token not supplied; retaining server configuration\./);
  assert.match(deployWorkflow, /awk '!\/\^TELEGRAM_BOT_TOKEN=\/'/);
  assert.match(deployWorkflow, /printf 'telegram_bot_token=%q\\n'/);
});
