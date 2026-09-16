import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const seed = readFileSync("prisma/seed.ts", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260915120000_smart_catalog_and_controls/migration.sql",
  "utf8",
);

const confirmedFilms = [
  "Vision 85",
  "Vision 89",
  "Vision 95",
  "Vision A-85",
  "Vision B-88",
  "Vision C-92",
  "DEC-SMART 1",
  "DEC-SMART 2",
  "DEC-SMART 3",
];

const confirmedPowerSupplies = [50, 100, 200, 300, 500, 1000].map(
  (watts) => `Rolan Control ${watts}W`,
);

test("confirmed Smart films exist in legacy and canonical catalogs", () => {
  for (const model of confirmedFilms) {
    assert.ok(legacy.includes(model), `legacy catalog is missing ${model}`);
    assert.ok(seed.includes(model), `seed is missing ${model}`);
    assert.ok(migration.includes(model), `migration is missing ${model}`);
  }
  assert.match(legacy, /Rolan PRO MS \(Mitsubishi\)/);
  assert.match(legacy, /Rolan PRO AR \(Arshi · Китай\)/);
  assert.match(legacy, /Переменный рисунок \/ текстура/);
});

test("Smart power supplies are separate from film models", () => {
  for (const model of confirmedPowerSupplies) {
    assert.ok(legacy.includes(model), `measurement UI is missing ${model}`);
    assert.ok(seed.includes(model), `seed is missing ${model}`);
    assert.ok(migration.includes(model), `migration is missing ${model}`);
  }
  assert.match(legacy, /powerSupplyModel/);
  assert.match(legacy, /controlOptions/);
});

test("Smart control options include the confirmed ecosystems", () => {
  for (const option of ["Wi-Fi", "Мультизона", "Google Home", "Amazon Alexa", "Apple Home", "Настенный выключатель"]) {
    assert.ok(legacy.includes(option), `measurement UI is missing ${option}`);
  }
  assert.match(legacy, /Голосовое управление/);
});

test("generic Smart defaults are archived and hidden from new selection", () => {
  assert.match(legacy, /Replaced by confirmed Rolan PRO Smart catalog/);
  assert.match(legacy, /if \(c\.archived\) return/);
  assert.match(legacy, /!c\.archived \|\| c\.id === selectedId/);
});

test("Smart field seeding targets SMART_FILM", () => {
  const smartFieldLoop = seed.match(/for \(const \[field_key,[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(smartFieldLoop, /service_type_id: serviceTypeMap\.SMART_FILM/);
  assert.doesNotMatch(smartFieldLoop, /service_type_id: serviceTypeMap\.SAFETY_FILM/);
});
