import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const html = readFileSync(
  path.join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

test("legacy CRM uses the authenticated server AI gateway", () => {
  assert.match(html, /fetch\('\/api\/v1\/ai\/claude'/);
  assert.doesNotMatch(html, /anthropic-dangerous-direct-browser-access/);
  assert.doesNotMatch(html, /fetch\('https:\/\/api\.anthropic\.com\/v1\/messages'/);
});

test("legacy CRM no longer renders or persists an Anthropic key", () => {
  assert.doesNotMatch(html, /id="int-ai-key"/);
  assert.doesNotMatch(html, /db\.settings\.ai\.apiKey\s*=/);
  assert.match(html, /delete s\.integrations\.ai\.apiKey/);
});
