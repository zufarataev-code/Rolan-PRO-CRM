import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const legacy = readFileSync(
  path.join(process.cwd(), "private/legacy/rolanpro-crm-cloud.html"),
  "utf8",
);

test("the rate directory exposes one customer price for every catalog model", () => {
  assert.match(legacy, /Цены конкретных продуктов и моделей/);
  assert.match(legacy, /направление → услуга \/ линейка → бренд → модель \/ толщина → цена клиенту/);
  assert.match(legacy, /db\.settings\?\.catalog/);
  assert.match(legacy, /saveCanonicalCatalogRetailPrice/);
  assert.match(legacy, /updateCatalogItem\(id, 'retailPerSqft', price\)/);
  assert.match(legacy, /Цена клиенту \/ sq ft/);
});

test("a newly priced product is added to the existing warehouse and project catalog", () => {
  assert.match(legacy, /function createCanonicalCatalogProduct\(\)/);
  assert.match(legacy, /filmCategory,/);
  assert.match(legacy, /productName,/);
  assert.match(legacy, /modelCode,/);
  assert.match(legacy, /retailPerSqft,/);
  assert.match(legacy, /db\.settings\.catalog\.push/);
  assert.doesNotMatch(legacy, /db\.settings\.pricingCatalog/);
});

test("the exact model price flows into the project separately from warehouse cost", () => {
  assert.match(legacy, /Закупочная стоимость конкретного рулона хранится в «Складе»/);
  assert.match(legacy, /const defaultPrice = win\.pricePerSqft \?\? o\.priceOverridePerSqft \?\? cat\?\.retailPerSqft \?\? 0/);
  assert.match(legacy, /costPerSqft: null/);
});

test("model price rows stay usable on a phone without a wide table", () => {
  assert.match(legacy, /data-film-price-row/);
  assert.match(legacy, /grid-cols-2 md:grid-cols-/);
  assert.match(legacy, /md:hidden block text-\[11px\]/);
  assert.doesNotMatch(legacy, /data-film-price-group[^]*min-width:760px/);
});
