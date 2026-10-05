import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// deploy/watch-production.sh runs prisma/seed.ts on every release. Reference rows
// the owner edits in Settings must therefore be created once and never reset.
const seed = readFileSync("prisma/seed.ts", "utf8");

function upsertUpdate(model: string) {
  const start = seed.indexOf(`await prisma.${model}.upsert({`);
  assert.ok(start > 0, `${model} upsert`);
  const update = seed.slice(start).match(/update: ([^\n]*)/);
  assert.ok(update, `${model} update`);
  return update[1];
}

test("a release does not reset service prices, costs and installer rates", () => {
  assert.equal(upsertUpdate("serviceType"), "{},");
  assert.equal(upsertUpdate("serviceAddon"), "{},");
});

test("a release does not reset the owner's complexity multipliers and cities", () => {
  assert.equal(upsertUpdate("complexityLevel"), "{ name_en, color_token },");
  assert.equal(upsertUpdate("city"), "{ name_en },");
});

test("a release refreshes only a film's technical specification, not the owner's names, unit and order", () => {
  assert.equal(upsertUpdate("filmCatalog"), "technicalSpecs,");
  const keep = seed.slice(seed.indexOf("const {\n      category_name_ru: _categoryNameRu"), seed.indexOf("} = specs;"));
  for (const field of ["category_name_ru", "brand_name_ru", "model_name_ru", "thickness", "unit", "sort_order"]) {
    assert.match(keep, new RegExp(`${field}: _`), field);
  }
});
