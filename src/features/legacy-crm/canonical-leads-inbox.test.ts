import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("active CRM inbox reads canonical Messenger leads without copying them into legacy storage", () => {
  assert.match(source, /let canonicalLeads = \[\]/);
  assert.match(source, /fetch\('\/api\/v1\/leads', \{ cache: 'no-store' \}\)/);
  assert.match(source, /lead\?\.source === 'facebook_messenger'/);
  assert.match(source, /CONSULTATION_SCHEDULED/);
  assert.match(source, /new Date\(right\.scheduled_start_at\).*new Date\(left\.scheduled_start_at\)/);
  assert.match(source, /!\['cancelled', 'canceled', 'deleted'\]\.includes\(item\?\.status\)/);
  assert.match(source, /startCanonicalLeadsPolling\(\)/);
  assert.doesNotMatch(source, /db\.canonicalLeads\s*=/);
});

test("booked Messenger leads open the canonical consultation instead of creating a duplicate project", () => {
  assert.match(source, /label: 'Messenger'/);
  assert.match(source, /openCanonicalConsultationCard\('\$\{l\.consultation\.consultation_id\}'\)/);
  assert.match(source, /function openCanonicalConsultationCard\(consultationId\)/);
  assert.match(source, /l\.canonical && l\.consultation/);
});
