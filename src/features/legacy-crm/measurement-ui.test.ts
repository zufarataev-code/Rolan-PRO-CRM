import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyCrm = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("measurement workspace focuses on one room and a four-step flow", () => {
  assert.match(legacyCrm, /manager-measure-progress/);
  assert.match(legacyCrm, /Работаем только с одной комнатой за раз/);
  assert.match(legacyCrm, /managerActiveRoom\(o\)/);
  assert.match(legacyCrm, /managerSelectRoom/);
  assert.match(legacyCrm, /Материал и проверка/);
});

test("measurement workspace keeps costing and cutting out of the primary input view", () => {
  assert.match(legacyCrm, /<details class="manager-results-panel">/);
  assert.match(legacyCrm, /Проверка материала и результат/);
  assert.doesNotMatch(
    legacyCrm.slice(
      legacyCrm.indexOf("function renderManagerMeasureModal"),
      legacyCrm.indexOf("function openManagerMeasureModal"),
    ),
    /manager-measure-table/,
  );
});

test("measurement material picker is scoped to the selected service category", () => {
  assert.match(legacyCrm, /function managerScopedCatalogOptionsHtml/);
  assert.match(legacyCrm, /c\.category === category \|\| c\.id === selectedId/);
});

test("one project supports separate measurements for multiple film services", () => {
  assert.match(legacyCrm, /function orderMeasureScopes\(order\)/);
  assert.match(legacyCrm, /serviceTypes: selectedServices\.map\(item => item\.id\)/);
  assert.match(legacyCrm, /function managerSelectMeasureScope\(oid, scopeKey\)/);
  assert.match(legacyCrm, /У каждого будет собственный замер и материал/);
  assert.match(legacyCrm, /filter\(w => \(w\.measureScope \|\| orderMeasureScope\(o\)\) === activeScopeKey\)/);
  assert.match(legacyCrm, /Добавьте размеры для каждой услуги/);
  assert.match(legacyCrm, /defaultCatalogByScope/);
});
