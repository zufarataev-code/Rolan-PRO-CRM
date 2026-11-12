import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * Owner, 2026-11-12: «на одном окне матовую, на другом Black Silver» and
 * «приезжайте с плёнкой — на месте выберем»: sizes, KP and installation go
 * ahead without a final film.
 */
const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function makeContext(role = "manager") {
  const catalog = [
    { id: "bs", category: "solar", retailPerSqft: 10, brand: "X", model: "Black Silver" },
    { id: "mp50", category: "solar", retailPerSqft: 12, brand: "X", model: "MP50" },
    { id: "matte", category: "decorative", retailPerSqft: 8, brand: "X", model: "Matte" },
  ];
  const offerings: Record<string, any> = {
    solar: { id: "solar", direction: "solar", filmIds: ["bs", "mp50"] },
    deco: { id: "deco", direction: "decorative", filmIds: ["matte"] },
  };
  const order: any = {
    id: "o1", serviceType: "solar_film", measurerId: "m1", status: "measurement_scheduled", timeline: [],
    measurements: { rooms: [{ id: "r1", windows: [
      { id: "w1", measureScope: "solar_film", offeringId: "solar", catalogId: "bs", area: 20 },
      { id: "w2", measureScope: "solar_film", offeringId: "solar", catalogId: "bs", area: 10 },
    ] }] },
  };
  const getCatalogItem = (id: string) => catalog.find((item) => item.id === id) || null;
  const scopeOf = (cat: any) => (cat?.category === "decorative" ? "decorative_film" : "solar_film");
  const ctx: any = vm.createContext({
    db: { settings: { catalog } },
    state: { currentUserId: role === "measurer" ? "m1" : "u1" },
    getCatalogItem,
    getOrder: () => order,
    catalogLabel: (item: any) => `${item.brand} ${item.model}`,
    catalogShortLabel: (item: any) => item.model,
    measureAllWindows: (o: any) => o.measurements.rooms.flatMap((room: any) => room.windows.map((win: any) => ({ room, win }))),
    measureScopeByCatalog: scopeOf,
    measureScopeInfo: (key: string) => ({ key, short: key === "decorative_film" ? "Декоративная" : "Солнцезащитная" }),
    serviceOffering: (id: string) => offerings[id] || null,
    serviceOfferingNoFilm: () => false,
    serviceOfferingNeedsSizes: () => true,
    serviceOfferingAllowedFilmIds: (offering: any) => offering?.filmIds || [],
    serviceOfferingsFor: (direction: string) => Object.values(offerings).filter((item: any) => item.direction === direction),
    serviceOfferingDirection: (scope: string) => (scope === "decorative_film" ? "decorative" : "solar"),
    serviceOfferingUnit: () => "sqft",
    applyWindowOffering: (win: any, offering: any) => { win.offeringId = offering?.id || ""; return win; },
    normalizeMeasureWindowTypeForScope: (_s: string, t: string) => t,
    syncWindowPanelsForType: () => {},
    windowCatalog: (win: any) => getCatalogItem(win.catalogId),
    orderUserCanSeeMoney: () => role !== "measurer",
    currentUser: () => ({ role, id: role === "measurer" ? "m1" : "u1" }),
    projectEstimateIsApproved: () => true,
    projectProposalAccepted: () => true,
    projectCardEdit: (fn: () => void) => fn(),
    reapproved: [] as string[],
    projectReapproveEstimate: (_o: any, note: string) => ctx.reapproved.push(note),
    invalidateProjectEstimate: () => {},
    primaryServiceInfo: () => null,
    academyEsc: (v: unknown) => String(v),
    jsQuote: (v: unknown) => String(v),
    fmtMoney: (v: number) => `$${v}`,
    save: () => {},
  });
  vm.runInContext(stages.slice(stages.indexOf("function filmVariantGroup()")), ctx);
  return { ctx, order };
}

test("one window takes a film of another direction and moves there with its service", () => {
  const { ctx, order } = makeContext();
  assert.equal(ctx.projectSetWindowFilm("o1", "r1", "w2", "matte"), true);
  const [w1, w2] = order.measurements.rooms[0].windows;
  assert.equal(w1.catalogId, "bs", "the other window keeps Black Silver");
  assert.equal(w2.catalogId, "matte");
  assert.equal(w2.measureScope, "decorative_film");
  assert.equal(w2.offeringId, "deco");
  assert.ok(order.offeringIds.includes("deco"));
  assert.equal(ctx.state._managerActiveScopeByOrder.o1, "decorative_film", "the measurer follows the window");
});

test("«клиент выберет на месте»: variants apply to those windows only, the choice on site re-prices", () => {
  const { ctx, order } = makeContext();
  ctx.projectSetWindowFilm("o1", "r1", "w2", "__onsite");
  const [w1, w2] = order.measurements.rooms[0].windows;
  assert.equal(w2.filmOnSite, true);
  assert.equal(order.filmChoicePending, true);
  ctx.projectFilmVariantToggle("o1", "mp50");
  ctx.projectFilmVariantToggle("o1", "bs");
  assert.equal(JSON.stringify(order.filmVariants), '["mp50","bs"]');
  assert.equal(w2.catalogId, "mp50", "the on-site window is priced by the recommended film");
  assert.equal(w1.catalogId, "bs", "a window with a fixed film is untouched");
  assert.match(ctx.orderFilmChoiceBadge(order), /Плёнку выберут на месте · везём 2/);
  // Accepting the KP with the recommended film does not lock the on-site choice.
  const items = [{ client_selected: true, dynamic_fields: { choice_group: "film_variant", catalog_id: "mp50", window_ids: ["w2"] } }];
  assert.equal(ctx.projectApplyClientFilmChoice(order, items), false);
  assert.equal(ctx.projectChooseFilmOnSite("o1", "bs"), true);
  assert.equal(w2.catalogId, "bs");
  assert.equal(w2.filmOnSite, false);
  assert.ok(order.filmVariantChosenAt);
  assert.equal(order.timeline.at(-1).key, "film_chosen_on_site");
  assert.match(ctx.reapproved[0], /выбрана на месте/);
  assert.equal(ctx.orderFilmChoiceBadge(order), "");
});

test("the assigned measurer picks films and variants without seeing prices", () => {
  const { ctx, order } = makeContext("measurer");
  assert.equal(ctx.projectSetWindowFilm("o1", "r1", "w1", "__onsite"), true);
  ctx.projectFilmVariantToggle("o1", "mp50");
  assert.deepEqual([...order.filmVariants], ["mp50"]);
  const html = ctx.projectFilmOnSiteVariantsHtml(order);
  assert.match(html, /Клиент выберет плёнку на месте/);
  assert.doesNotMatch(html, /\/sqft/);
  assert.equal(ctx.projectChooseFilmOnSite("o1", "mp50"), false, "the final choice is the manager's (price change)");
});

test("measurement, KP and the window cards accept «на месте»", () => {
  assert.match(legacy, /!windowCatalog\(win\) && !win\.filmOnSite\)\) issues\.push/);
  assert.match(legacy, /отметьте 2–3 плёнки, из которых клиент выберет на месте/);
  assert.match(legacy, /projectWindowExtraFilmOptionsHtml\(o, win\)/);
  assert.match(legacy, /windowFilmQuickSelectHtml\(o, r, w\)/);
  assert.match(legacy, /projectFilmOnSiteVariantsHtml\(o\)/);
});
