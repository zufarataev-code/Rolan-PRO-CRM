import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function block() {
  const start = html.indexOf("// ---------- ПЛЁНКА, ВПИСАННАЯ ВРУЧНУЮ");
  const end = html.indexOf("function projectEstimateMarkChanged(o, reason) {");
  assert.ok(start > 0 && end > start, "manual film block not found");
  return html.slice(start, end);
}

function load(fields: Record<string, string>, role = "manager") {
  const order: { id: string; number: string; extraServices: Array<{ id: string; quickProjectLine: boolean; serviceType: string; qty: number; unit: string; startDate: string; catalogId?: string; manualFilmName?: string }> } = {
    id: "o1",
    number: "R-1",
    extraServices: [{ id: "l1", quickProjectLine: true, serviceType: "solar_film", qty: 300, unit: "sqft", startDate: "2026-10-10" }],
  };
  const db = { settings: { catalog: [] as Array<Record<string, unknown>>, filmRolls: { widths: [1524] } }, purchaseRequests: [] as Array<Record<string, unknown>>, vendors: [] };
  const changes: string[] = [];
  const context = vm.createContext({
    db,
    state: {},
    document: { getElementById: (id: string) => (id in fields ? { value: fields[id] } : null) },
    getOrder: (id: string) => (id === "o1" ? order : null),
    projectQuickLines: (o: typeof order) => o.extraServices,
    currentUser: () => ({ id: "u_m1", role }),
    orderUserCanSeeMoney: () => true,
    primaryServiceInfo: () => ({ catalogCategory: "solar" }),
    projectQuickManualFilmName: (line: { manualFilmName?: string }) => String(line.manualFilmName || ""),
    catalogLabel: (item: { filmCategory?: string; model?: string }) => [item.filmCategory, item.model].filter(Boolean).join(" · "),
    activeProjectFilmPurchaseRequest: () => null,
    purchaseRequestNumber: () => `PUR-2026-${String(db.purchaseRequests.length + 1).padStart(4, "0")}`,
    projectQuickDateValue: (value: string) => value || "",
    projectEstimateMarkChanged: (_o: unknown, reason: string) => changes.push(reason),
    save: () => undefined,
    openQuickProjectEntry: () => undefined,
    cloudStatus: () => undefined,
    alert: (message: string) => { throw new Error(message); },
    warehouseCatalogStockStats: () => ({ availableSqft: 0 }),
    catalogCanBeSelected: (item: { archived?: boolean; id: string }, selectedId = "") => !item.archived || item.id === selectedId,
    getCatalogItem: (id: string) => db.settings.catalog.find((item) => item.id === id),
    uid: (() => { let n = 0; return () => `id${++n}`; })(),
  });
  vm.runInContext(`${block()}; Object.assign(this, { manualFilmMetres, saveManualProjectFilm, reconcileManualFilmPurchase, refreshManualFilmNeededBy });`, context);
  return { context: context as unknown as { manualFilmMetres: (sqft: number, width: number) => number; saveManualProjectFilm: (o: string, l: string) => void; reconcileManualFilmPurchase: (o: unknown, c: string, r: string) => unknown; refreshManualFilmNeededBy: (o: unknown) => void }, db, order, changes };
}

test("metres for the purchase follow the roll width with 10% waste, rounded up to 0.5 m", () => {
  const { context } = load({});
  // 300 sq ft on a 60" (1524 mm) roll: 300 * 92.903 / 1524 * 1.1 = 20.12 m → 20.5 m
  assert.equal(context.manualFilmMetres(300, 1524), 20.5);
  assert.equal(context.manualFilmMetres(0, 1524), 0);
});

test("a manually written film is fixed in the project and ordered for it", () => {
  const { context, db, order, changes } = load({ "mf-type": "Керамическая", "mf-name": "Huper Optik Ceramic 40", "mf-vendor": "", "mf-width": "1524", "mf-note": "срочно" });
  context.saveManualProjectFilm("o1", "l1");

  assert.equal(db.settings.catalog.length, 1);
  const film = db.settings.catalog[0];
  assert.equal(film.pendingPurchase, true);
  assert.equal(film.filmCategory, "Керамическая");
  assert.equal(film.category, "solar");
  assert.equal(order.extraServices[0].catalogId, film.id, "the project line points to the film");

  assert.equal(db.purchaseRequests.length, 1);
  const request = db.purchaseRequests[0];
  assert.equal(request.orderId, "o1");
  assert.equal(request.itemId, film.id);
  assert.equal(request.kind, "film");
  assert.equal(request.qty, 20.5);
  assert.equal(request.status, "draft");
  assert.equal(request.source, "manual_project_film");
  assert.match(String(request.note), /R-1: 300 sqft\. срочно/);
  assert.match(changes[0], /заявка на закупку PUR-2026-0001/);

  // Writing the same film again reuses it and its request.
  context.saveManualProjectFilm("o1", "l1");
  assert.equal(db.settings.catalog.length, 1);
  assert.equal(db.purchaseRequests.length, 1);

  // A new quantity updates the draft request.
  order.extraServices[0].qty = 600;
  context.reconcileManualFilmPurchase(order, film.id as string, "метраж в проекте обнулён");
  assert.equal(db.purchaseRequests[0].qty, 40.5);
  assert.match(String(db.purchaseRequests[0].note), /R-1: 600 sqft\. срочно/);
});

test("solar films need a type, and a quantity must be set first", () => {
  assert.throws(() => load({ "mf-type": "", "mf-name": "X", "mf-width": "1524" }).context.saveManualProjectFilm("o1", "l1"), /тип солнцезащитной/);
  const noQty = load({ "mf-type": "Зеркальная", "mf-name": "X", "mf-width": "1524" });
  noQty.order.extraServices[0].qty = 0;
  assert.throws(() => noQty.context.saveManualProjectFilm("o1", "l1"), /метраж/);
});

test("the project film cell offers manual entry to managers and pending films can be selected", () => {
  assert.match(html, /onclick="openManualProjectFilmForm\('\$\{o\.id\}','\$\{line\.id\}'\)">✍️ Вписать плёнку вручную и заказать<\/button>/);
  assert.match(html, /warehouseCatalogStockStats\(catalog\.id\)\.availableSqft <= 0 && !catalog\.pendingPurchase/);
  assert.match(html, /const SOLAR_FILM_SUBTYPES = \['Зеркальная', 'Керамическая', 'Магнетронная \(напылённая\)', 'Фотохромная', 'Другая'\];/);
});

test("a manually written film is labelled by its whole name, without a repeated model part", () => {
  assert.match(html, /if \(c\.addedManuallyAt\) return '';/);
  assert.match(html, /заявка \$\{academyEsc\(request\.number\)\} · \$\{academyEsc\(\(PURCHASE_STATUS\[request\.status\] \|\| \[request\.status\]\)\[0\]\)\}/);
});

test("a zero quantity cancels the draft and a new quantity orders again", () => {
  const { context, db, order } = load({ "mf-type": "Зеркальная", "mf-name": "Mirror 15", "mf-width": "1524" });
  context.saveManualProjectFilm("o1", "l1");
  const filmId = order.extraServices[0].catalogId as string;
  order.extraServices[0].qty = 0;
  context.reconcileManualFilmPurchase(order, filmId, "метраж в проекте обнулён");
  assert.equal(db.purchaseRequests[0].status, "cancelled", "no request for zero metres");
  order.extraServices[0].qty = 100;
  context.reconcileManualFilmPurchase(order, filmId, "метраж в проекте обнулён");
  assert.equal(db.purchaseRequests.length, 2);
  assert.equal(db.purchaseRequests[1].status, "draft");
  assert.equal(db.purchaseRequests[1].qty, 7);
});

test("one draft per project and film covers every line that uses it", () => {
  const { context, db, order } = load({ "mf-type": "Керамическая", "mf-name": "Ceramic 40", "mf-width": "1524" });
  order.extraServices.push({ id: "l2", quickProjectLine: true, serviceType: "solar_film", qty: 300, unit: "sqft", startDate: "2026-10-05" });
  context.saveManualProjectFilm("o1", "l1");
  context.saveManualProjectFilm("o1", "l2");
  assert.equal(db.purchaseRequests.length, 1, "one shared draft");
  assert.equal(db.purchaseRequests[0].sqftSnapshot, 600);
  assert.equal(db.purchaseRequests[0].qty, 40.5, "600 sq ft, not the last line alone");
  assert.equal(db.purchaseRequests[0].neededBy, "2026-10-05", "needed by the earliest line");

  // The second line switches to another film: the draft shrinks to the first line, not cancelled.
  order.extraServices[1].catalogId = "film_other";
  context.reconcileManualFilmPurchase(order, order.extraServices[0].catalogId as string, "в проекте выбрана другая плёнка");
  assert.equal(db.purchaseRequests[0].status, "draft");
  assert.equal(db.purchaseRequests[0].qty, 20.5);

  // The last line using the film is deleted: the draft is cancelled.
  const filmId = order.extraServices[0].catalogId as string;
  order.extraServices.splice(0, 1);
  context.reconcileManualFilmPurchase(order, filmId, "позиция удалена из проекта");
  assert.equal(db.purchaseRequests[0].status, "cancelled");
  assert.match(String(db.purchaseRequests[0].note), /Отменено: позиция удалена из проекта/);
});

test("choosing another film keeps the old draft only while another line needs it; a reused zero-stock film is marked pending", () => {
  const { context, db, order } = load({ "mf-type": "Керамическая", "mf-name": "Ceramic 40", "mf-width": "1524" });
  db.settings.catalog.push({ id: "film_old", category: "solar", model: "Ceramic 40", brand: "X" });
  context.saveManualProjectFilm("o1", "l1");
  assert.equal(order.extraServices[0].catalogId, "film_old", "the existing film is reused");
  assert.equal(db.settings.catalog[0].pendingPurchase, true);
  order.extraServices[0].catalogId = "film_new";
  context.reconcileManualFilmPurchase(order, "film_old", "в проекте выбрана другая плёнка");
  assert.equal(db.purchaseRequests[0].status, "cancelled");
  assert.match(String(db.purchaseRequests[0].note), /Отменено: в проекте выбрана другая плёнка/);
});

test("every quick line change and deletion reconciles the film purchase", () => {
  assert.match(html, /if \(filmChanged && previousCatalogId\) reconcileManualFilmPurchase\(o, previousCatalogId, 'в проекте выбрана другая плёнка'\);/);
  assert.match(html, /if \(line\.catalogId && \(filmChanged \|\| field === 'qty'\)\) reconcileManualFilmPurchase\(o, line\.catalogId, 'метраж в проекте обнулён'\);/);
  assert.match(html, /if \(removedCatalogId\) reconcileManualFilmPurchase\(o, removedCatalogId, 'позиция удалена из проекта'\);/);
});

test("the draft's deadline follows line dates, also when scheduling fills them", () => {
  const { context, db, order } = load({ "mf-type": "Зеркальная", "mf-name": "Mirror 15", "mf-width": "1524" });
  order.extraServices[0].startDate = "";
  context.saveManualProjectFilm("o1", "l1");
  assert.equal(db.purchaseRequests[0].neededBy, null, "no date yet");
  order.extraServices[0].startDate = "2026-10-20";
  context.refreshManualFilmNeededBy(order);
  assert.equal(db.purchaseRequests[0].neededBy, "2026-10-20");
  assert.match(html, /if \(field === 'startDate'\) refreshManualFilmNeededBy\(o\);/);
  assert.match(html, /refreshManualFilmNeededBy\(o\);\n {4}save\(\);\n {4}notifyClientEventScheduled\(oid, 'install'\);/);
});

test("an archived film with the same name is not reused for a manual purchase", () => {
  const { context, db, order } = load({ "mf-type": "Керамическая", "mf-name": "Ceramic 40", "mf-width": "1524" });
  db.settings.catalog.push({ id: "film_archived", category: "solar", model: "Ceramic 40", brand: "X", archived: true });
  context.saveManualProjectFilm("o1", "l1");
  assert.notEqual(order.extraServices[0].catalogId, "film_archived");
  assert.equal(db.settings.catalog[0].pendingPurchase, undefined, "the archived film is untouched");
  assert.equal(db.settings.catalog.length, 2, "a new manual film is created");
});
