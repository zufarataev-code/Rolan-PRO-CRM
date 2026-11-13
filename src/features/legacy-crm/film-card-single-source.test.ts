import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * Owner, 2026-11-13: «на приходе указываем цену закупки, и система сама считает
 * закупку — в карточке плёнки это задвоение; зарплата монтажнику считается из
 * направления, а не из плёнки; отход считается после внесения размеров».
 */
const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const server = readFileSync("src/features/legacy-crm/service-solutions.ts", "utf8");

function fn(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end === -1 ? undefined : end);
}

test("new film card asks only for what belongs to the film", () => {
  const modal = fn(legacy, "openNewCatalogItemModal");
  assert.doesNotMatch(modal, /ncat-cost|ncat-rate|ncat-waste/);
  assert.match(modal, /Закупку берём из прихода рулонов/);
  const create = fn(legacy, "createCatalogItemFromModal");
  assert.match(create, /costPerSqft: null, installerRatePerSqft: null, wastePct: null/);
});

test("catalog settings table no longer edits purchase cost or waste", () => {
  assert.doesNotMatch(legacy, /updateCatalogItem\('\$\{c\.id\}','(costPerSqft|wastePct|installerRatePerSqft)'/);
});

test("a window costs its area at the warehouse purchase price, without a flat waste percent", () => {
  const ctx: any = vm.createContext({
    windowCatalog: () => ({ id: "film", costPerSqft: 99, wastePct: 12 }),
    windowActualAreaSqft: () => 20,
    warehouseCatalogCostPerSqft: (id: string, historical: boolean) => (id === "film" && historical ? 3 : 0),
  });
  vm.runInContext(fn(legacy, "windowFilmCost"), ctx);
  assert.equal(ctx.windowFilmCost({}), 60, "20 sq ft × $3 from receipts; the card's $99 and 12% are ignored");
});

test("no calculation reads the film card's flat waste percent", () => {
  for (const [name, source] of [["legacy", legacy], ["stages", stages], ["server", server]] as const) {
    assert.doesNotMatch(source, /1 \+ [^;\n]*wastePct[^;\n]*\/ 100/, `${name}: flat waste formula is gone`);
  }
});
