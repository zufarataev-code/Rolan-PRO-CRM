import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildLeadWelcomeSms, isLeadBusinessHours } from "./lead-first-touch-core";

const MONDAY_10AM_PT = new Date("2026-11-09T18:00:00.000Z");
const MONDAY_11PM_PT = new Date("2026-11-10T07:00:00.000Z");
const TUESDAY_6AM_PT = new Date("2026-11-10T14:00:00.000Z");
const SATURDAY_8PM_PT = new Date("2026-11-08T04:00:00.000Z");

test("office hours are Monday–Saturday 8:00–18:00 Los Angeles time", () => {
  assert.equal(isLeadBusinessHours(MONDAY_10AM_PT), true);
  assert.equal(isLeadBusinessHours(MONDAY_11PM_PT), false);
  assert.equal(isLeadBusinessHours(new Date("2026-11-08T19:00:00.000Z")), false);
});

test("daytime form lead is told the manager will call shortly", () => {
  const sms = buildLeadWelcomeSms({ name: "Wesley Elsea", channel: "meta_lead_ads", now: MONDAY_10AM_PT });
  assert.match(sms, /^Hi Wesley, thank you for your interest in Rolan PRO/);
  assert.match(sms, /call you shortly from \(424\) 325-0512/);
  assert.match(sms, /Reply STOP to opt out\.$/);
  assert.ok(sms.length <= 320);
});

test("after-hours lead is politely asked when the manager may call", () => {
  const night = buildLeadWelcomeSms({ name: "Wesley", channel: "meta_lead_ads", now: MONDAY_11PM_PT });
  assert.match(night, /office is closed right now/);
  assert.match(night, /What time tomorrow is best/);
  assert.match(buildLeadWelcomeSms({ name: "W", channel: "website", now: TUESDAY_6AM_PT }), /What time today/);
  assert.match(buildLeadWelcomeSms({ name: "W", channel: "website", now: SATURDAY_8PM_PT }), /What time Monday/);
});

test("Messenger lead SMS does not promise a call the bot is already arranging", () => {
  const sms = buildLeadWelcomeSms({ name: "Ann", channel: "facebook_messenger", now: MONDAY_11PM_PT });
  assert.doesNotMatch(sms, /closed|call you shortly/);
  assert.match(sms, /text your visit details/);
});

test("new leads and SMS replies are wired into the first-touch flow", () => {
  assert.match(readFileSync("src/features/integrations/meta-lead-ads.ts", "utf8"), /sendLeadFirstTouch\(/);
  assert.match(readFileSync("src/features/integrations/facebook-messenger.ts", "utf8"), /sendLeadFirstTouch\(/);
  assert.match(readFileSync("app/api/webhooks/twilio/inbound/route.ts", "utf8"), /handleLeadSmsReply\(/);
});
