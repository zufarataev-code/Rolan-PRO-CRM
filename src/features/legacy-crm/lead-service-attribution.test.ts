import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyCrm = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260914062000_project_lead_intent_attribution/migration.sql",
  "utf8",
);
const publisher = readFileSync("src/features/legacy-crm/publish-proposal.ts", "utf8");
const launcher = readFileSync("src/features/projects/launch.ts", "utf8");

test("new order captures one immutable incoming service separately from project services", () => {
  assert.match(legacyCrm, /По какой услуге пришёл лид/);
  assert.match(legacyCrm, /state\._newOrderServices = \[v\]/);
  assert.match(legacyCrm, /leadIntentServiceType: service\.id/);
  assert.match(legacyCrm, /leadSource: c\.source \|\| 'direct'/);
  assert.match(legacyCrm, /Добавленные услуги не меняют исходное направление лида/);
  assert.match(legacyCrm, /order\.serviceTypes = services/);
  assert.doesNotMatch(
    legacyCrm.match(/function saveManagerProjectServices[\s\S]*?\n}/)?.[0] || "",
    /leadIntentServiceType\s*=/,
  );
});

test("monthly lead statistics use incoming service while tracking cross-sell separately", () => {
  const stats = legacyCrm.match(/function buildLeadIntentStats[\s\S]*?\n}/)?.[0] || "";
  assert.match(stats, /orderLeadIntentServiceId\(order\)/);
  assert.match(stats, /orderLeadSource\(order\)/);
  assert.match(stats, /id !== serviceId/);
  assert.match(legacyCrm, /Входящие лиды по услугам — текущий месяц/);
  assert.match(legacyCrm, /С допродажей/);
});

test("canonical project preserves original lead service and source", () => {
  assert.match(schema, /lead_intent_service_type_id/);
  assert.match(schema, /lead_source/);
  assert.match(migration, /FOREIGN KEY \(lead_intent_service_type_id\) REFERENCES service_types/);
  assert.match(publisher, /lead_intent_service_code/);
  assert.match(publisher, /lead_source/);
  assert.match(launcher, /projectLeadAttributionFromItems/);
  assert.match(launcher, /lead_intent_service_type_id:/);
  assert.match(launcher, /lead_source:/);
});
