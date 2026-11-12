import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { choiceGroupOf } from "./publish-proposal";

const stages = readFileSync("private/legacy/production-stages.js", "utf8");
const legacy = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const service = readFileSync("src/features/proposals/service.ts", "utf8");
const publisher = readFileSync("src/features/legacy-crm/publish-proposal.ts", "utf8");
const clientView = readFileSync("src/components/client-proposal-view.tsx", "utf8");

function variantsBlock() {
  const start = stages.indexOf("function filmVariantGroup()");
  return stages.slice(start);
}

function makeContext() {
  const catalog = [
    { id: "mp35", category: "solar", retailPerSqft: 10, vlt: 35.5, brand: "MAGNITRONIC", model: "MP35" },
    { id: "mp50", category: "solar", retailPerSqft: 12, vlt: 58.1, brand: "MAGNITRONIC", model: "MP50" },
    { id: "mp20", category: "solar", retailPerSqft: 11, vlt: 23.5, brand: "MAGNITRONIC", model: "MP20" },
  ];
  const order: any = {
    id: "o1",
    status: "proposal_sent",
    filmVariants: ["mp35", "mp50", "mp20"],
    measurements: { rooms: [{ id: "r1", windows: [{ id: "w1", catalogId: "mp35", area: 20 }, { id: "w2", catalogId: "mp35", area: 30 }] }] },
    timeline: [],
  };
  const getCatalogItem = (id: string) => catalog.find((item) => item.id === id) || null;
  const context: any = vm.createContext({
    db: { settings: { catalog } },
    state: { currentUserId: "u1" },
    getCatalogItem,
    catalogLabel: (item: any) => `${item.brand} ${item.model}`,
    premiumCatalogTitleEn: (item: any) => `${item.brand} ${item.model}`,
    measureAllWindows: (o: any) => o.measurements.rooms.flatMap((room: any) => room.windows.map((win: any) => ({ room, win }))),
    serviceOffering: () => null,
    serviceOfferingNoFilm: () => false,
    windowCatalog: (win: any) => getCatalogItem(win.catalogId),
    premiumNum: (value: any) => Number(value) || 0,
    premiumSelectedProductId: (_prop: any, win: any) => win.catalogId,
    // The KP rule for a client-chosen product: area × film price.
    premiumWindowPrice: (prop: any, _order: any, win: any) => ({ price: win.area * getCatalogItem(prop.selections.products[win.id])!.retailPerSqft }),
    projectEstimateIsApproved: () => true,
    projectProposalAccepted: () => false,
    projectCardEdit: (fn: () => void) => fn(),
    reapproved: [] as string[],
    projectReapproveEstimate: (_o: any, note: string) => context.reapproved.push(note),
    primaryServiceInfo: () => null,
    getOrder: () => order,
    orderUserCanSeeMoney: () => true,
    currentUser: () => ({ role: "manager" }),
    serviceOfferingAllowedFilmIds: () => [],
    save: () => {},
  });
  vm.runInContext(variantsBlock(), context);
  return { context, order };
}

test("2–3 film variants become one client choice in the KP, recommended pre-selected", () => {
  const { context, order } = makeContext();
  const filmLine = {
    service_code: "SOLAR_FILM", room_name: "Living", item_kind: "film", quantity: 50, line_price: 450, // estimate after a 10% discount
    measurement_snapshot: { windows: [{ window_id: "w1" }, { window_id: "w2" }] },
  };
  const items: any[] = [filmLine, { item_kind: "service", line_price: 100, title_en: "Removal" }];
  assert.equal(context.projectFilmVariantsApply(order, items, { byWindow: {} }, { selections: { products: {} } }), true);
  const variants = items.filter((item) => item.dynamic_fields?.choice_group === "film_variant");
  assert.equal(variants.length, 3);
  assert.equal(items.includes(filmLine), false, "the plain film line is replaced");
  assert.deepEqual(variants.map((item) => item.client_selected), [true, false, false]);
  assert.equal(variants[0].line_price, 450, "recommended keeps the approved estimate");
  assert.equal(variants[1].line_price, 540, "MP50: 50 sq ft × $12 with the same 10% discount");
  assert.match(variants[0].title_en, /^Option A \(recommended\)/);
  assert.match(variants[1].description_en, /58% visible light/);
  assert.ok(variants.every((item) => item.is_optional));
});

test("the client's film choice goes onto the same windows and re-approves the estimate", () => {
  const { context, order } = makeContext();
  const items = [
    { client_selected: false, dynamic_fields: { choice_group: "film_variant", catalog_id: "mp35", window_ids: ["w1", "w2"] } },
    { client_selected: true, dynamic_fields: { choice_group: "film_variant", catalog_id: "mp50", window_ids: ["w1", "w2"] } },
  ];
  assert.equal(context.projectApplyClientFilmChoice(order, items), true);
  assert.deepEqual(order.measurements.rooms[0].windows.map((win: any) => win.catalogId), ["mp50", "mp50"]);
  assert.equal(order.filmVariantChosenId, "mp50");
  assert.equal(context.reapproved.length, 1);
  assert.equal(context.projectFilmChoiceOpen(order), false);
  // A second pull with the same choice changes nothing.
  assert.equal(context.projectApplyClientFilmChoice(order, items), false);
});

test("the pre-selected recommended variant is not mistaken for a client decision", () => {
  const { context, order } = makeContext();
  const items = [{ client_selected: true, dynamic_fields: { choice_group: "film_variant", catalog_id: "mp35", window_ids: ["w1", "w2"] } }];
  assert.equal(context.projectApplyClientFilmChoice(order, items), false);
  assert.equal(context.projectFilmChoiceOpen(order), true);
  assert.match(context.orderFilmChoiceBadge(order), /Клиент выбирает плёнку/);
});

test("server keeps exactly one alternative per choice group and counts it in the scope", () => {
  assert.equal(choiceGroupOf({ choice_group: "film_variant" }), "film_variant");
  assert.equal(choiceGroupOf({}), "");
  assert.equal(choiceGroupOf(null), "");
  assert.match(publisher, /members\.forEach\(\(item\) => \{ item\.clientSelected = item === keep; \}\)/);
  assert.match(publisher, /!item\.isOptional \|\| \(choiceGroupOf\(item\.dynamicFields\) && item\.clientSelected\)/);
  assert.match(service, /async function enforceProposalChoiceGroups/);
  assert.match(service, /const chosenAlternatives = await enforceProposalChoiceGroups\(tx, proposal\.proposal_id, input\.items\)/);
  assert.match(clientView, /type="radio"/);
  assert.match(clientView, /Выбрать этот вариант/);
});

test("the CRM wires the variants into the KP wizard, snapshot, client pull and status badges", () => {
  assert.match(stages, /\$\{projectProposalOptionsHtml\(o\)\}\s*\$\{projectFilmVariantsHtml\(o\)\}/);
  assert.match(stages, /const filmChosen = projectApplyClientFilmChoice\(fresh, items\);/);
  assert.match(legacy, /projectFilmVariantsApply\(order, items, calc, prop\)/);
  assert.match(legacy, /orderFilmChoiceBadge\(o\)/);
});

test("the manager can make another variant the recommended one before the client decides", () => {
  const { context, order } = makeContext();
  context.projectFilmVariantMakeRecommended("o1", "mp50");
  assert.equal(JSON.stringify(order.filmVariants), JSON.stringify(["mp50", "mp35", "mp20"]));
  assert.deepEqual(order.measurements.rooms[0].windows.map((win: any) => win.catalogId), ["mp50", "mp50"]);
  assert.equal(context.reapproved.length, 1);
  order.filmVariantChosenAt = "2026-11-12T00:00:00Z";
  context.projectFilmVariantMakeRecommended("o1", "mp20");
  assert.equal(order.filmVariants[0], "mp50", "locked once the client has chosen");
});
