import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function functionSource(name: string, nextName: string) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} must be present before ${nextName}`);
  return source.slice(start, end);
}

test("ordinary service directory edits save without rebuilding the CRM", () => {
  const update = functionSource("updateServiceOffering", "refreshServiceOfferingFilmSummary");
  assert.match(update, /save\(\);[\s\S]*?if \(field === 'unit'\) \{[\s\S]*?renderServiceOfferingDirectory\(\);/);
  assert.doesNotMatch(update, /save\(\);\s*render\(\);/);
  assert.match(source, /function renderServiceOfferingDirectory\(\) \{[\s\S]*?preservePositionForNextRender\(\);[\s\S]*?render\(\);/);
  assert.match(source, /updateServiceOffering\('\$\{offering\.id\}','pricePerSqft',this\.value,this\)/);
  assert.match(source, /data-service-offering-row="\$\{offering\.id\}"/);
});

test("film links update their open summary without closing and reopening the directory", () => {
  const toggle = functionSource("toggleServiceOfferingFilm", "renderServiceOfferingsSection");
  assert.match(toggle, /save\(\);\s*refreshServiceOfferingFilmSummary\(id\);/);
  assert.doesNotMatch(toggle, /render\(\)/);
  assert.match(source, /data-service-offering-film-summary="\$\{offering\.id\}"/);
});

test("catalog cell edits keep the table in place", () => {
  const update = functionSource("updateCatalogItem", "addCatalogItem");
  assert.match(update, /save\(\);/);
  assert.doesNotMatch(update, /render\(\)/);
  assert.match(update, /field === 'category'[\s\S]*?control\.style\.background/);
  assert.match(source, /updateCatalogItem\('\$\{c\.id\}','retailPerSqft',parseFloat\(this\.value\)\|\|0,this\)/);
});
