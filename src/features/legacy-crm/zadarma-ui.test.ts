import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("legacy CRM uses server-side Zadarma instead of exposing secrets", () => {
  assert.match(html, /Zadarma — телефония CRM/);
  assert.match(html, /async function startManagedCall\(phone\)/);
  assert.match(html, /zadarmaApi\('\/callback'/);
  assert.doesNotMatch(html, /id="zadarma-api-secret"/);
});

test("Zadarma calls sync into CRM and missed calls become tasks", () => {
  assert.match(html, /async function syncZadarmaCalls\(\)/);
  assert.match(html, /provider:'zadarma'/);
  assert.match(html, /title:`Пропущенный звонок:/);
  assert.match(html, /zadarmaCallId:externalId/);
});
