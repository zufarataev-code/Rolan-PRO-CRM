import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * Owner, 2026-11-13: «загрузи этот список; Джонсон, Мадико, Ролан ПРО —
 * остальное удали, оставь как базу, чтобы могли достать; при выборе бренда
 * подтягивается его список, по умолчанию Rolan PRO; приватная — зеркальные».
 */
const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const block = legacy.slice(
  legacy.indexOf("const CORE_FILM_BRANDS = ["),
  legacy.indexOf("// Official manufacturer catalogs used by Warehouse and Procurement."),
);

/** Values built inside the vm belong to another realm; compare them as plain data. */
const same = (actual: unknown, expected: unknown) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);

function makeContext() {
  const ctx: any = vm.createContext({
    canonicalCatalogCategory: (value: string) => String(value || "").replace(/_film$/, ""),
    academyEsc: (value: unknown) => String(value),
    jsQuote: (value: unknown) => String(value),
  });
  vm.runInContext(`${block}\nthis.api = { filmBrandKey, filmBrandOptions, filmBrandActive, filmBrandFilter, filmBrandChipsHtml, filmGroupsByFilmCategory, rolanProHouseCatalogItems, ensureRolanProHouseCatalog, archiveNonCoreFilmBrands };`, ctx);
  return ctx.api;
}

test("the owner's price list becomes the Rolan PRO line, one model per shade", () => {
  const api = makeContext();
  const items: any[] = api.rolanProHouseCatalogItems();
  assert.equal(items.length, 83);
  assert.equal(new Set(items.map((item) => item.id)).size, 83);
  assert.equal(items.every((item) => item.brand === "Rolan PRO" && item.retailPerSqft === null && item.costPerSqft === null), true);
  const silver35 = items.find((item) => item.model === "Silver 35%");
  same([...silver35.rollWidthsIn], [60, 72]);
  same(silver35.supplierRolls.map((roll: any) => roll.priceUsd), [155, 210]);
  same([...items.find((item) => item.model === "Silver 20%").rollWidthsIn], [72]);
  assert.equal(items.find((item) => item.model === "Centurion IR30 3%").supplierRolls[0].priceUsd, 190);
  assert.equal(items.find((item) => item.model === "Centurion IR30 5%").supplierRolls[0].priceUsd, 185);
  const lux = items.find((item) => item.model === "Lux IR80 20%");
  assert.equal(lux.category, "solar");
  assert.equal(lux.vlt, 20);
  assert.equal(lux.irBlock, 80);
  assert.equal(items.find((item) => item.model === "Safety 8 mil").thickness, "8 mil");
});

test("privacy is the mirror films; frost lives in decorative and is also sold in privacy", () => {
  const api = makeContext();
  const items: any[] = api.rolanProHouseCatalogItems();
  const privacy = items.filter((item) => item.category === "privacy");
  assert.equal(privacy.filter((item) => /^Зеркальная/.test(item.filmCategory)).length, 13);
  same(privacy.filter((item) => !/^Зеркальная/.test(item.filmCategory)).map((item) => item.model).sort(), ["Blackout", "Whiteout"]);
  const frost = items.find((item) => item.model === "White Frost");
  assert.equal(frost.category, "decorative");
  same([...frost.extraCategories], ["privacy"]);
  assert.equal(frost.filmCategory, "Матовая");
});

test("the list is added without overwriting what the owner already filled", () => {
  const api = makeContext();
  const catalog: any[] = [{ id: "film_rolanpro_white_frost", brand: "Rolan PRO", category: "privacy", retailPerSqft: 9, model: "Матовая белая" }];
  const vendors = [{ id: "v_custom_nexfil", name: "NEXFIL" }];
  assert.equal(api.ensureRolanProHouseCatalog(catalog, vendors), 82);
  assert.equal(catalog.length, 83);
  assert.equal(catalog[0].category, "privacy");
  assert.equal(catalog[0].model, "Матовая белая");
  assert.equal(catalog[0].retailPerSqft, 9);
  assert.equal(catalog.every((item) => item.vendorId === "v_custom_nexfil"), true);
  assert.equal(api.ensureRolanProHouseCatalog(catalog, vendors), 0);
});

test("other manufacturers go to the archive, anything in real use stays", () => {
  const api = makeContext();
  const catalog: any[] = [
    { id: "mp", brand: "Rolan PRO", category: "solar" },
    { id: "smart", brand: "Rolan PRO MS", category: "smart" },
    { id: "j", brand: "Johnson Window Films", category: "solar" },
    { id: "m", brand: "Madico", category: "protective" },
    { id: "own", brand: "Custom", category: "solar" },
    { id: "ll", brand: "LLumar", category: "solar" },
    { id: "nx", brand: "NEXFIL", category: "decorative" },
    { id: "stock", brand: "3M", category: "solar" },
    { id: "sold", brand: "SunTek", category: "solar" },
    { id: "used", brand: "Solar Gard", category: "solar" },
    { id: "hand", brand: "Armolan", category: "solar", addedManuallyAt: "2026-11-01" },
    { id: "removal", brand: "Service", category: "removal" },
  ];
  const data = {
    settings: { catalog, serviceOfferings: [{ id: "s1", filmIds: ["sold"] }] },
    inventory: [{ catalogId: "stock", remainingLengthM: 0 }],
    orders: [{ measurements: { rooms: [{ windows: [{ catalogId: "used" }] }] } }],
  };
  const result = api.archiveNonCoreFilmBrands(data);
  assert.equal(result.archived, 2);
  same(catalog.filter((item) => item.archived).map((item) => item.id), ["ll", "nx"]);
  assert.match(catalog.find((item) => item.id === "ll").archiveReason, /Rolan PRO, Johnson, Madico/);
  same(result.kept.map((entry: any) => `${entry.id}:${entry.why}`), [
    "stock:есть рулоны на складе", "sold:привязана к услуге", "used:стоит в проекте", "hand:добавлена вручную",
  ]);
});

test("a film list opens on Rolan PRO and switches by manufacturer", () => {
  const api = makeContext();
  const films = [
    { id: "j1", brand: "Johnson", filmCategory: "Architectural" },
    { id: "r1", brand: "Rolan PRO", filmCategory: "Нано-керамика" },
    { id: "r2", brand: "Magnitronic", filmCategory: "Carbon" },
    { id: "r3", brand: "Rolan PRO", filmCategory: "Нано-керамика" },
    { id: "m1", brand: "Madico", filmCategory: "Solar" },
  ];
  same(api.filmBrandOptions(films).map((option: any) => `${option.label}:${option.count}`), ["Rolan PRO:3", "Johnson:1", "Madico:1"]);
  assert.equal(api.filmBrandActive(films), "rolanpro");
  assert.equal(api.filmBrandActive(films, "madico"), "madico");
  assert.equal(api.filmBrandActive(films, "", films[0]), "johnson");
  assert.equal(api.filmBrandActive(films, "__all"), "__all");
  assert.equal(api.filmBrandActive([films[0]]), "__all");
  assert.equal(api.filmBrandActive([films[0], films[4]]), "__all");
  same(api.filmBrandFilter(films, "rolanpro").map((film: any) => film.id), ["r1", "r2", "r3"]);
  same(api.filmGroupsByFilmCategory(api.filmBrandFilter(films, "rolanpro")).map((group: any) => `${group.title}:${group.films.length}`), ["Нано-керамика:2", "Carbon:1"]);
  const chips = api.filmBrandChipsHtml(films, "rolanpro", "pick");
  assert.match(chips, /Производитель/);
  assert.match(chips, /data-film-brand="rolanpro" aria-pressed="true" onclick="pick\('rolanpro'\)"/);
  assert.match(chips, /data-film-brand="__all" aria-pressed="false"/);
  assert.equal(api.filmBrandChipsHtml([films[1]], "__all", "pick"), "");
});

test("the list and the cleanup run once; cashier, window list and warehouse use the manufacturer switch", () => {
  assert.match(legacy, /if \(!db\._rolanProHouseCatalogV1\) \{\s+ensureRolanProHouseCatalog\(s\.catalog, db\.vendors\);\s+db\._rolanProHouseCatalogV1 = true;/);
  assert.match(legacy, /if \(!db\._filmBrandCleanup20261113\) \{\s+const cleanup = archiveNonCoreFilmBrands\(db\);/);
  assert.match(legacy, /const brand = filmBrandActive\(allFilms, c\.brand, film\);/);
  assert.match(legacy, /filmBrandChipsHtml\(allFilms, brand, 'serviceCashierPickBrand'\)/);
  assert.match(stages, /filmBrandChipsHtml\(allFilms, brand, 'windowFilmListPickBrand'\)/);
  assert.match(stages, /filmBrandChipsHtml\(live, brand, 'setInventoryFilmBrand'\)/);
  assert.match(stages, /function setFilmArchived\(id, archived\)[\s\S]*?currentUser\(\)\?\.role !== 'owner'/);
  assert.match(stages, /function restoreFilmBrand\(key\)/);
});

test("a warehouse category opens on Rolan PRO and filters its models by manufacturer", () => {
  // Owner, 2026-11-13: «и где тут фильтр по производителю» — Склад → Плёнка → Солнцезащитная.
  const view = legacy.slice(legacy.indexOf("function renderFilmCategoryModels(category) {"), legacy.indexOf("function renderFilmModelStock(catalogId) {"));
  const catalog = [
    { id: "r1", brand: "RolanPRO", model: "Titan Prime", category: "solar" },
    { id: "r2", brand: "Rolan PRO", model: "Lux IR80 20%", category: "solar" },
    { id: "m1", brand: "Madico", model: "Sunscape Select 10", category: "solar" },
    { id: "j1", brand: "Johnson Window Films", model: "Trident", category: "solar" },
    { id: "x1", brand: "Madico", model: "SafetyShield", category: "protective" },
  ];
  const ctx: any = vm.createContext({
    canonicalCatalogCategory: (value: string) => String(value || "").replace(/_film$/, ""),
    academyEsc: (value: unknown) => String(value),
    jsQuote: (value: unknown) => String(value),
    db: { settings: { catalog, inventoryAlerts: {} } },
    state: { inventoryFilmQuery: "", inventoryFilmBrand: "" },
    currentUser: () => ({ role: "manager" }),
    blankCatalogItems: () => [],
    catalogItemInCategory: (item: any, category: string) => item.category === category,
    filmWarehouseRolls: () => [],
    catColor: () => ({ dot: "#000" }),
    filmWarehouseCategoryIcon: () => "",
    catLabel: (value: string) => value,
    catalogSpecLabel: () => "",
    rpStockBadge: () => "",
    setInventoryFilmBrand: () => undefined,
  });
  vm.runInContext(`${block}\n${view}\nthis.render = renderFilmCategoryModels;`, ctx);
  const rows = (html: string) => [...html.matchAll(/openFilmWarehouseModel\('([^']+)'\)/g)].map((match) => match[1]);

  const opened = ctx.render("solar");
  same(rows(opened), ["r1", "r2"]);
  assert.match(opened, /data-film-category-brands/);
  assert.match(opened, /data-film-brand="rolanpro" aria-pressed="true" onclick="setInventoryFilmBrand\('rolanpro'\)"/);
  assert.match(opened, /Johnson <span[^>]*>1<\/span>/);
  assert.match(opened, /Madico <span[^>]*>1<\/span>/);

  ctx.state.inventoryFilmBrand = "madico";
  same(rows(ctx.render("solar")), ["m1"]);
  ctx.state.inventoryFilmBrand = "__all";
  same(rows(ctx.render("solar")), ["r1", "r2", "m1", "j1"]);

  // A search looks through every manufacturer and hides the switch.
  ctx.state.inventoryFilmBrand = "madico";
  ctx.state.inventoryFilmQuery = "trident";
  const found = ctx.render("solar");
  same(rows(found), ["j1"]);
  assert.doesNotMatch(found, /data-film-category-brands/);

  // One manufacturer in the category: nothing to switch, every model is shown.
  ctx.state.inventoryFilmQuery = "";
  const single = ctx.render("protective");
  same(rows(single), ["x1"]);
  assert.doesNotMatch(single, /data-film-brands/);
});
