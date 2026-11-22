import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildWhatsAppSystemPrompt,
  humanTookOver,
  parseWhatsAppBotOutput,
  toAnthropicMessages,
  WHATSAPP_BOT_KIND,
  whatsappLeadName,
  type WhatsAppHistoryItem,
} from "./whatsapp-bot-core";

const now = new Date("2026-11-22T19:00:00Z");
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);

test("WhatsApp prompt reuses the verified Rolan PRO knowledge and channel rules", () => {
  const prompt = buildWhatsAppSystemPrompt();
  assert.match(prompt, /MAGNITRONIC PRIME is Rolan PRO's own premium solar-control film series/);
  assert.match(prompt, /Do not announce or repeat that you are an AI/);
  assert.match(prompt, /CHANNEL: WhatsApp/);
  assert.match(prompt, /never ask for it/);
  assert.match(prompt, /Never confirm a specific appointment/);
  assert.match(prompt, /"handoff": boolean/);
});

test("the bot stays silent once a manager wrote to the customer", () => {
  const botOnly: WhatsAppHistoryItem[] = [
    { direction: "in", body: "hi", sentAt: at(5) },
    { direction: "out", body: "Hello!", sentAt: at(4), kind: WHATSAPP_BOT_KIND },
  ];
  assert.equal(humanTookOver(botOnly, now), false);
  const manager: WhatsAppHistoryItem[] = [...botOnly, { direction: "out", body: "Zak here", sentAt: at(60), actorUserId: "u1" }];
  assert.equal(humanTookOver(manager, now), true);
  const oldManager: WhatsAppHistoryItem[] = [...botOnly, { direction: "out", body: "old", sentAt: at(13 * 60) }];
  assert.equal(humanTookOver(oldManager, now), false);
});

test("history becomes alternating messages that start with the customer", () => {
  const messages = toAnthropicMessages([
    { direction: "out", body: "template", sentAt: at(30) },
    { direction: "in", body: "Heat", sentAt: at(10) },
    { direction: "in", body: "and privacy", sentAt: at(9) },
    { direction: "out", body: "Got it", sentAt: at(8), kind: WHATSAPP_BOT_KIND },
    { direction: "in", body: "home", sentAt: at(1) },
  ]);
  assert.deepEqual(messages, [
    { role: "user", content: "Heat\nand privacy" },
    { role: "assistant", content: "Got it" },
    { role: "user", content: "home" },
  ]);
});

test("bot output parses JSON and falls back to plain text", () => {
  const parsed = parseWhatsAppBotOutput('```json\n{"reply":"Thanks!","handoff":true,"handoffReason":"time given","name":"Maged","serviceType":"Solar","city":"Encino","preferredTime":"Tue morning"}\n```');
  assert.equal(parsed?.reply, "Thanks!");
  assert.equal(parsed?.handoff, true);
  assert.equal(parsed?.preferredTime, "Tue morning");
  assert.equal(parseWhatsAppBotOutput("Hello there")?.reply, "Hello there");
  assert.equal(parseWhatsAppBotOutput('{"broken"'), null);
  assert.equal(parseWhatsAppBotOutput(""), null);
});

test("new WhatsApp leads get the profile name or the phone", () => {
  assert.equal(whatsappLeadName("Maged Asham", "+13105550100"), "Maged Asham");
  assert.equal(whatsappLeadName("", "+13105550100"), "WhatsApp +13105550100");
});

test("Twilio inbound route hands WhatsApp messages to the bot without blocking Twilio", () => {
  const route = readFileSync("app/api/webhooks/twilio/inbound/route.ts", "utf8");
  assert.match(route, /detectTwilioChannel\(params\.From\) === "whatsapp"/);
  assert.match(route, /void handleInboundWhatsApp/);
  assert.match(route, /ProfileName/);
  const workflow = readFileSync(".github/workflows/deploy-production.yml", "utf8");
  assert.match(workflow, /TWILIO_WHATSAPP_FROM: "\+14243250512"/);
  const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(legacy, /whatsapp: \{ label: 'WhatsApp'/);
});

test("inbox lets managers open and answer a new WhatsApp lead without a project", () => {
  const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(legacy, /if \(!order && message\.channel === 'whatsapp' && user\.role === 'manager'\) return true;/);
  assert.match(legacy, /function openWhatsAppPhoneThread\(phone\)/);
  assert.match(legacy, /💬 Открыть переписку и ответить/);
  assert.match(legacy, /await sendWhatsAppViaTwilio\(phone, body, \{\}\)/);
  assert.match(legacy, /x\.kind === 'whatsapp_bot' \? '🤖 Бот'/);
  assert.match(legacy, /else if \(state\.whatsappThreadPhone\) refreshWhatsAppPhoneThread\(\);/);
  const service = readFileSync("src/features/twilio/service.ts", "utf8");
  assert.match(service, /kind: typeof asObject\(message\.raw_payload\)\?\.kind === "string"/);
});

test("Enter sends a message in the client and WhatsApp dialogs, Shift+Enter makes a new line", () => {
  const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(legacy, /event\.key==='Enter'&&!event\.shiftKey&&!event\.isComposing\)\{event\.preventDefault\(\);sendClientConversationMessage\(\);\}/);
  assert.match(legacy, /event\.key==='Enter'&&!event\.shiftKey&&!event\.isComposing\)\{event\.preventDefault\(\);sendWhatsAppPhoneThreadMessage\(\);\}/);
  assert.doesNotMatch(legacy, /⌘\/Ctrl \+ Enter — отправить/);
});
