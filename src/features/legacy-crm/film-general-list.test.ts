import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * Owner, 2026-11-13: «у услуги свой список — не могу выбрать из общего; нужна
 * кнопка «выбрать плёнку из общего списка», а на складе распределять плёнку
 * между категориями».
 */
const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function makeContext(role = "manager") {
  const catalog: any[] = [
    { id: "bs", category: "solar", brand: "X", model: "Black Silver" },
    { id: "ceramic", category: "solar", brand: "Y", model: "Ceramic 30" },
    { id: "matte", category: "decorative", brand: "X", model: "Matte" },
    { id: "frost", category: "privacy", brand: "Z", model: "Frost" },
  ];
  const offerings: Record<string, any> = { bsService: { id: "bsService", direction: "solar", filmIds: ["bs"] } };
  const order: any = {
    id: "o1", serviceType: "solar_film", measurerId: "m1", timeline: [],
    measurements: { rooms: [{ id: "r1", windows: [{ id: "w1", name: "Окно 1", measureScope: "solar_film", offeringId: "bsService", catalogId: "bs" }] }] },
  };
  const canon = (v: string) => String(v || "").replace(/_film$/, "");
  const extraOf = (c: any) => (Array.isArray(c?.extraCategories) ? c.extraCategories.filter((k: string) => k !== c.category) : []);
  const getCatalogItem = (id: string) => catalog.find((item) => item.id === id) || null;
  const ctx: any = vm.createContext({
    db: { settings: { catalog } },
    state: { currentUserId: role === "measurer" ? "m1" : "u1" },
    getCatalogItem,
    getOrder: () => order,
    catalogLabel: (item: any) => `${item.brand} ${item.model}`,
    catalogShortLabel: (item: any) => item.model,
    catalogFilmCategory: () => "",
    canonicalCatalogCategory: canon,
    catalogExtraCategories: extraOf,
    catalogItemInCategory: (c: any, cat: string) => c.category === canon(cat) || extraOf(c).includes(canon(cat)),
    catalogByCategory: () => {
      const groups: Record<string, any[]> = {};
      catalog.forEach((c) => { (groups[c.category] = groups[c.category] || []).push(c); extraOf(c).forEach((k: string) => (groups[k] = groups[k] || []).push(c)); });
      return groups;
    },
    catLabel: (k: string) => ({ solar: "Солнцезащитная", privacy: "Приватная", decorative: "Декоративная" } as any)[k] || k,
    filmWarehouseCategoryIcon: () => "",
    measureAllWindows: (o: any) => o.measurements.rooms.flatMap((room: any) => room.windows.map((win: any) => ({ room, win }))),
    measureScopeByCatalog: (c: any) => `${c.category}_film`,
    measureScopeInfo: (key: string) => ({ key, short: key }),
    serviceOffering: (id: string) => offerings[id] || null,
    serviceOfferingNoFilm: () => false,
    serviceOfferingNeedsSizes: () => true,
    serviceOfferingAllowedFilmIds: (offering: any) => offering?.filmIds || [],
    serviceOfferingsFor: (direction: string) => Object.values(offerings).filter((item: any) => item.direction === direction),
    serviceOfferingDirection: (scope: string) => canon(scope),
    windowCatalog: (win: any) => getCatalogItem(win.catalogId),
    orderUserCanSeeMoney: () => role !== "measurer",
    currentUser: () => ({ role, id: role === "measurer" ? "m1" : "u1" }),
    invalidateProjectEstimate: () => {},
    academyEsc: (v: unknown) => String(v),
    jsQuote: (v: unknown) => String(v),
    confirmAnswer: true,
    alerts: [] as string[],
    reopened: [] as string[],
    save: () => {},
    render: () => {},
    closeModal: () => {},
  });
  ctx.confirm = () => ctx.confirmAnswer;
  ctx.alert = (m: string) => ctx.alerts.push(m);
  ctx.openManagerMeasureModal = (oid: string) => ctx.reopened.push(oid);
  vm.runInContext(stages.slice(stages.indexOf("function filmVariantGroup()")), ctx);
  return { ctx, order, catalog };
}

test("a film the service does not link is picked from the general list and stays on the window", () => {
  const { ctx, order } = makeContext();
  ctx.projectSetWindowFilm("o1", "r1", "w1", "__list", true);
  assert.match(ctx.state.modal, /Плёнка из общего списка/);
  assert.match(ctx.state.modal, /Ceramic 30/);
  assert.match(ctx.state.modal, /Солнцезащитная · направление этого окна/);
  assert.equal(ctx.projectPickWindowFilmFromList("ceramic"), true);
  const win = order.measurements.rooms[0].windows[0];
  assert.equal(win.catalogId, "ceramic");
  assert.equal(win.filmFromGeneralList, true);
  assert.equal(JSON.stringify(ctx.reopened), '["o1"]', "back to the measurement window");
  assert.match(ctx.projectWindowCurrentFilmOptionHtml(order, win), /Ceramic 30 · из общего списка/);
});

test("a film of another category: the manager adds it to this category in one tap; the measurer is told", () => {
  const { ctx, order, catalog } = makeContext();
  ctx.openWindowFilmListModal("o1", "r1", "w1", true);
  assert.equal(ctx.projectPickWindowFilmFromList("frost"), true);
  assert.equal(JSON.stringify(catalog.find((c) => c.id === "frost").extraCategories), JSON.stringify(["solar"]));
  assert.equal(order.measurements.rooms[0].windows[0].catalogId, "frost");
  const field = makeContext("measurer");
  field.ctx.openWindowFilmListModal("o1", "r1", "w1", true);
  assert.equal(field.ctx.projectPickWindowFilmFromList("matte"), false);
  assert.match(field.ctx.alerts[0], /Попросите менеджера/);
});

test("warehouse: one list of all films; main category and «также в» are set there", () => {
  const { ctx, catalog } = makeContext();
  const html = ctx.renderAllFilmsList();
  assert.match(html, /Все плёнки/);
  assert.equal((html.match(/data-all-films-row/g) || []).length, 4);
  ctx.toggleFilmExtraCategory("matte", "privacy");
  assert.equal(JSON.stringify(catalog.find((c) => c.id === "matte").extraCategories), JSON.stringify(["privacy"]));
  ctx.setFilmMainCategory("matte", "privacy");
  assert.equal(catalog.find((c) => c.id === "matte").category, "privacy");
  assert.equal(JSON.stringify(catalog.find((c) => c.id === "matte").extraCategories), JSON.stringify([]), "the main category is not repeated as extra");
  const field = makeContext("installer");
  field.ctx.setFilmMainCategory("bs", "privacy");
  assert.equal(field.catalog.find((c) => c.id === "bs").category, "solar", "only owner/manager move films");
});

test("wiring: list option in the window select, warehouse buttons, extra categories offered by services", () => {
  assert.match(legacy, /value === windowFilmFromListValue\(\)/);
  assert.match(legacy, /📚 Все плёнки · категории/);
  assert.match(legacy, /category === '__all' && typeof renderAllFilmsList === 'function'/);
  assert.match(legacy, /filmCategoryEditorHtml\(item\)/);
  assert.match(legacy, /extra\.some\(key => canonicalServiceDirection\(key\) === target\)/);
});

test("Codex #509: a film placed «также в» the window's category stays in the window's direction", () => {
  const { ctx, order, catalog } = makeContext();
  catalog.find((c) => c.id === "matte").extraCategories = ["solar"];
  ctx.applyWindowOffering = (win: any, offering: any) => { win.offeringId = offering?.id || ""; return win; };
  assert.equal(ctx.projectSetWindowFilm("o1", "r1", "w1", "matte"), true);
  const win = order.measurements.rooms[0].windows[0];
  assert.equal(win.catalogId, "matte");
  assert.equal(win.measureScope, "solar_film", "not moved to Decorative");
  assert.match(legacy, /catalogItemInCategory\(film, windowScopeCategory\(o, win\)\)\);/);
});
