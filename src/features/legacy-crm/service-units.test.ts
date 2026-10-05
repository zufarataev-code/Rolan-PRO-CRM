import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { canonicalFilmCategory, prepareServiceSolutions, serviceSolutionsForViewer } from './service-solutions';

// Owner, 2026-10-05: five directions (privacy is its own); inside each, services
// with their own price, material and installer pay; per sq ft a service needs
// measured windows, per piece / zone / fixed sum / own unit it does not.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');

type Row = Record<string, any>;

function loadServices(role = 'owner') {
  const db: Row = { settings: { serviceOfferings: [] as Row[], catalog: [], installerRates: { workTypes: { washing: 4 } } }, orders: [] as Row[] };
  let n = 0;
  const services = [
    { id: 'smart_film', catalogCategory: 'smart', title: 'Смарт плёнка' },
    { id: 'privacy_film', catalogCategory: 'privacy', title: 'Приватная плёнка' },
  ];
  const context: any = vm.createContext({
    db, console,
    ORDER_PRIMARY_SERVICES: services,
    primaryServiceInfo: (id: string) => services.find(item => item.id === id),
    canonicalCatalogCategory: (value: string) => value,
    currentUser: () => ({ role }),
    uid: () => `id${++n}`,
    alert: () => undefined, save: () => undefined, render: () => undefined,
    getOrder: (id: string) => db.orders.find((order: Row) => order.id === id),
    measureAllWindows: (o: Row) => (o.measurements?.rooms || []).flatMap((room: Row) => (room.windows || []).map((win: Row) => ({ room, win }))),
    projectQuickLines: (o: Row) => (o.extraServices || []).filter((line: Row) => line.quickProjectLine),
    orderUserCanSeeMoney: () => true,
    projectEstimateMarkChanged: () => undefined,
    refreshProjectEstimateWorkspace: () => undefined,
    fmtMoney: (value: number) => `$${value}`,
    academyEsc: (value: unknown) => String(value ?? ''),
  });
  const start = html.indexOf('// ---------- УСЛУГИ ВНУТРИ НАПРАВЛЕНИЙ');
  vm.runInContext(html.slice(start, html.indexOf('function projectQuickLineCatalog(', start)), context);
  vm.runInContext(html.slice(html.indexOf('function offeringServiceType('), html.indexOf('function newOrderSelectedOfferings(')), context);
  return { c: context, db };
}

test('privacy is the fifth direction with its own measurement scope, colour, code and films', () => {
  const directions = html.slice(html.indexOf('const ORDER_PRIMARY_SERVICES = ['), html.indexOf('const ORDER_SERVICE_PALETTE'));
  for (const id of ['smart_film', 'solar_film', 'protective_film', 'decorative_film', 'privacy_film']) assert.match(directions, new RegExp(`id: '${id}'`), id);
  assert.match(directions, /id: 'privacy_film',[\s\S]*?catalogCategory: 'privacy'/);
  assert.match(html, /key: 'privacy_film',[\s\S]*?catalogCategory: 'privacy'/);
  assert.match(html, /privacy_film: \{ color: '#7c3aed', bg: '#f5f3ff' \}/);
  assert.match(html, /privacy_film: 'PRIVACY_FILM'/);
  assert.match(html, /const SERVICE_OFFERING_DIRECTIONS = \['smart', 'solar', 'protective', 'decorative', 'privacy'\];/);
  assert.match(html, /const ROLL_CATEGORY_KEYS = \['smart', 'solar', 'protective', 'decorative', 'privacy'\];/);
  // Privacy films stop being decorative; frost stays decorative.
  const aliases = html.slice(html.indexOf('function canonicalCatalogCategory(value)'), html.indexOf('function catalogMatchesCategory('));
  assert.match(aliases, /privacy: 'privacy', privacy_film: 'privacy', приватная: 'privacy'/);
  assert.match(aliases, /frost: 'decorative'/);
  assert.doesNotMatch(aliases, /privacy: 'decorative'/);
  assert.match(html, /if \(type === 'privacy_film'\) return 'privacy_film';\n {2}if \(type === 'decorative_film'\) return 'decorative_film';\n {2}if \(tags\.includes\('privacy'\)\) return 'privacy_film';/);
  assert.match(html, /if \(cat === 'privacy'\) return 'privacy_film';/);
  assert.equal(canonicalFilmCategory('privacy_film'), 'privacy');
  assert.equal(canonicalFilmCategory('Приватная'), 'privacy');
  assert.equal(canonicalFilmCategory('solar_film'), 'solar');
});

test('a service is priced per sq ft (sizes needed) or per piece, zone, fixed sum or own unit (no sizes)', () => {
  const { c, db } = loadServices();
  c.addServiceOffering('smart');
  const offering = db.settings.serviceOfferings[0];
  assert.equal(offering.unit, 'sqft');
  assert.equal(c.serviceOfferingNeedsSizes(offering), true);
  c.updateServiceOffering(offering.id, 'unit', 'zone');
  c.updateServiceOffering(offering.id, 'pricePerSqft', 100);
  c.updateServiceOffering(offering.id, 'installerRatePerSqft', 50);
  c.updateServiceOffering(offering.id, 'materialCostPerUnit', 12);
  assert.equal(c.serviceOfferingNeedsSizes(offering), false);
  assert.equal(c.serviceOfferingUnitShort(offering), 'зона');
  c.updateServiceOffering(offering.id, 'unit', 'yard');
  assert.equal(offering.unit, 'zone', 'unknown units are refused');
  c.updateServiceOffering(offering.id, 'unit', 'custom');
  c.updateServiceOffering(offering.id, 'unitLabel', '  час  ');
  assert.equal(c.serviceOfferingUnitShort(offering), 'час');
  assert.equal(c.serviceOfferingUnit({}), 'sqft', 'services saved before units are per sq ft');
});

test('a service without sizes becomes «quantity × price» in the project, with its own pay and material', () => {
  const { c, db } = loadServices();
  c.addServiceOffering('smart');
  const zone = db.settings.serviceOfferings[0];
  Object.assign(zone, { name: 'Подключение зоны', unit: 'zone', pricePerSqft: 100, installerRatePerSqft: 50, materialCostPerUnit: 12 });
  const line = c.projectOfferingLine(zone, 3);
  assert.deepEqual(
    [line.type, line.offeringId, line.serviceType, line.unit, line.unitPrice, line.qty, line.price, line.offeringInstallerRate, line.offeringMaterialCost],
    ['offering', zone.id, 'smart_film', 'zone', 100, 3, 300, 50, 12],
  );
  assert.equal(c.serviceOfferingInstallerRate(line), 50);
  assert.equal(c.serviceOfferingMaterialCost(line), 12);

  const order: Row = { id: 'o', offeringIds: [zone.id], extraServices: [line], measurements: { rooms: [] } };
  db.orders.push(order);
  assert.equal(c.orderNeedsMeasurements(order), false, 'no sizes needed: only a per-zone service');
  assert.deepEqual([...c.projectOfferingLines(order)].map((item: Row) => item.id), [line.id]);

  c.addServiceOffering('smart');
  const film = db.settings.serviceOfferings[1];
  order.offeringIds.push(film.id);
  assert.equal(c.orderNeedsMeasurements(order), true, 'a per-sq-ft service needs windows');
  assert.equal(c.orderNeedsMeasurements({ measurements: { rooms: [] } }), true, 'projects from before services keep needing sizes');
  assert.equal(c.orderNeedsMeasurements({ offeringIds: ['gone'] }), true, 'an unknown service is treated as measured');

  c.projectAddOfferingLine('o', film.id);
  assert.equal(order.extraServices.length, 1, 'a per-sq-ft service is never added as a quantity line');
  c.projectAddOfferingLine('o', zone.id);
  assert.equal(order.extraServices.length, 2);
});

test('the money of a service without sizes: revenue, material, installer pay per its crew', () => {
  const extra = html.slice(html.indexOf('function orderExtraServicesCost(o) {'), html.indexOf('function orderRevenue(o) {'));
  assert.match(extra, /projectOfferingLines\(o\)\.reduce\(\(sum, line\) => sum \+ \(Number\(line\.qty\) \|\| 0\) \* serviceOfferingMaterialCost\(line\), 0\)/);
  const pay = html.slice(html.indexOf('function orderAdditionalWorkPayoutForUser('), html.indexOf('function orderInstallerPayoutForUser('));
  assert.match(pay, /const rate = line\.offeringId \? serviceOfferingInstallerRate\(line\) : installerAdditionalWorkRate\(user, line\.type\);/);
  assert.match(pay, /const crew = projectServiceCrew\(o, line\);/, 'each service is paid to its own executors');
  // Only the quantity of a directory service is edited; its price follows.
  const update = html.slice(html.indexOf('function projectEstimateUpdateService('), html.indexOf('function projectEstimateDeleteService('));
  assert.match(update, /if \(field !== 'qty'\) return;\n {4}line\.qty = Math\.max\(0, parseFloat\(value\) \|\| 0\);\n {4}line\.price = Math\.round\(\(Number\(line\.unitPrice\) \|\| 0\) \* line\.qty \* 100\) \/ 100;/);
});

test('a project of services without sizes skips measurement; the proposal lists them line by line', () => {
  const creation = html.slice(html.indexOf('function createOrder(nextStep'), html.indexOf('function openClientModal()'));
  assert.match(creation, /extraServices: selectedOfferings\.filter\(item => !serviceOfferingNeedsSizes\(item\)\)\.map\(item => projectOfferingLine\(item, 1\)\)/);
  assert.match(creation, /setTimeout\(\(\) => \(orderNeedsMeasurements\(o\) \? openManagerMeasureModal\(o\.id\) : openProjectEstimateWorkspace\(o\.id\)\), 0\);/);
  assert.match(html, /createButton\.textContent = !validOffering \|\| newOrderSelectedOfferings\(\)\.some\(serviceOfferingNeedsSizes\) \? 'Создать и перейти к замеру →' : 'Создать проект →'/);
  const verification = html.slice(html.indexOf('function orderMeasurementVerificationIssues(o) {'), html.indexOf('function orderPaymentReadyForProduction('));
  assert.match(verification, /if \(!windows\.length\) return orderNeedsMeasurements\(o\) \? \['нет окон с размерами'\] : \[\];/);
  const readiness = html.slice(html.indexOf('function projectEstimateReadiness(o) {'), html.indexOf('function projectQuickLines(o) {'));
  assert.match(readiness, /не указано количество: /);
  assert.match(readiness, /не указана цена услуги: /);
  assert.match(html, /projectOfferingLines\(order\)\.filter\(line => premiumNum\(line\.price\) > 0\)\.forEach\(line => \{\n {4}items\.push\(\{\n {6}service_code: canonicalServiceCodeForOrderService\(line\.serviceType\) \|\| 'SOLAR_FILM',/);
  assert.match(html, /!line\.quickProjectLine && !line\.offeringId\)\.reduce/, 'directory services are not counted twice in «Additional project services»');
  // Windows only take per-sq-ft services.
  assert.match(html, /serviceOfferingsFor\(direction, \{ includeId: win\.offeringId \}\)\.filter\(item => serviceOfferingNeedsSizes\(item\) \|\| item\.id === win\.offeringId\)/);
});

const base: Row = {
  settings: {
    catalog: [{ id: 'mirror', category: 'privacy_film' }, { id: 'frost', category: 'decorative' }],
    serviceOfferings: [
      { id: 'one-way', name: 'Односторонняя', direction: 'privacy', unit: 'sqft', pricePerSqft: 18, installerRatePerSqft: 3, filmIds: ['mirror'] },
      { id: 'zone', name: 'Подключение зоны', direction: 'smart', unit: 'zone', pricePerSqft: 100, installerRatePerSqft: 50, materialCostPerUnit: 12 },
    ],
  },
  users: [{ id: 'installer', role: 'installer' }],
  orders: [{ id: 'o', serviceType: 'smart_film', extraServices: [] }],
};

test('the server accepts privacy services, units and films of the CRM category spelling', () => {
  assert.equal(prepareServiceSolutions(base, structuredClone(base), true), null);
  const wrongUnit: Row = structuredClone(base);
  wrongUnit.settings.serviceOfferings[1].unit = 'yard';
  assert.match(prepareServiceSolutions(base, wrongUnit, true)!, /единица/);
  const wrongFilm: Row = structuredClone(base);
  wrongFilm.settings.serviceOfferings[0].filmIds = ['frost'];
  assert.match(prepareServiceSolutions(base, wrongFilm, true)!, /Материалы/);
  const badCost: Row = structuredClone(base);
  badCost.settings.serviceOfferings[1].materialCostPerUnit = -1;
  assert.match(prepareServiceSolutions(base, badCost, true)!, /материала/);
});

test('managers do not see a service\'s installer rate or material cost; the server keeps and snapshots them', () => {
  const view = serviceSolutionsForViewer(base, false);
  assert.equal(view.settings.serviceOfferings[1].installerRatePerSqft, undefined);
  assert.equal(view.settings.serviceOfferings[1].materialCostPerUnit, undefined);
  assert.equal(view.settings.serviceOfferings[1].pricePerSqft, 100);
  assert.equal(prepareServiceSolutions(base, view, false), null, 'a redacted read round-trips');
  view.orders[0].extraServices = [{ id: 'line', type: 'offering', offeringId: 'zone', serviceType: 'smart_film', unit: 'zone', qty: 3, unitPrice: 100, price: 300, offeringMaterialCost: 999 }];
  assert.equal(prepareServiceSolutions(base, view, false), null);
  assert.equal(view.orders[0].extraServices[0].offeringInstallerRate, 50);
  assert.equal(view.orders[0].extraServices[0].offeringMaterialCost, 12, 'the manager cannot set the cost');
  const back = serviceSolutionsForViewer(view, false);
  assert.equal(back.orders[0].extraServices[0].offeringMaterialCost, undefined);
});

test('the privacy scope has its own measurement fields, saved on the window and shown in the tech sheet', () => {
  const studio = html.slice(html.indexOf('function measureStudioScopeSpecificHtml('), html.indexOf('function openEngineeringMeasureStudio('));
  assert.match(studio, /\} else if \(scope\.key === 'privacy_film'\) \{[\s\S]*?id="ms-privacy-when"[\s\S]*?id="ms-privacy-light"[\s\S]*?id="ms-privacy-look"[\s\S]*?id="ms-privacy-coverage"[\s\S]*?id="ms-privacy-notes"/);
  const formStart = html.indexOf('function measureStudioFormWindow() {');
  const form = html.slice(formStart, html.indexOf('\nfunction ', formStart + 10));
  assert.match(form, /const privacy = \{\n {4}when: document\.getElementById\('ms-privacy-when'\)/);
  assert.match(form, /decor,\n {4}privacy,/);
  assert.match(html, /if \(scope\.key === 'privacy_film'\) \{\n {4}const p = win\.privacy \|\| \{\};/);
});

test('an estimate approved by someone without internal economics records no internal cost', () => {
  const approve = html.slice(html.indexOf('function approveProjectEstimateAndOpenProposal(oid) {'), html.indexOf('function approveProjectEstimateAndOpenProposal(oid) {') + 3000);
  assert.match(approve, /productionCost: canSeeInternalEconomics \? orderPSS\(o\)\.total : null,/);
  assert.match(approve, /margin: canSeeInternalEconomics \? orderMargin\(o\) : null,/);
  assert.match(approve, /projectOfferingLines\(o\)\.length \? 'SERVICE_QUANTITIES' : 'QUICK_LINE_ITEMS'/);
});

function loadScopes(offerings: Row[]) {
  const context: any = vm.createContext({
    serviceOffering: (id: string) => offerings.find(item => item.id === id) || null,
    serviceOfferingNeedsSizes: (item: Row) => !item.unit || item.unit === 'sqft',
    offeringServiceType: (item: Row) => item.serviceType,
    orderOfferingNeedsSizes: (_order: Row, id: string) => { const item = offerings.find(entry => entry.id === id); return !item || !item.unit || item.unit === 'sqft'; },
  });
  const start = html.indexOf('const MEASURE_SCOPES = [');
  vm.runInContext(html.slice(start, html.indexOf('function managerActiveMeasureScope(', start)), context);
  return context;
}

test('a project saved as decorative with a «privacy» tag stays one decorative scope', () => {
  const c = loadScopes([]);
  const legacy = { serviceType: 'decorative_film', serviceTypes: ['decorative_film'], tags: ['decorative', 'privacy'] };
  assert.equal(c.orderMeasureScope(legacy), 'decorative_film');
  assert.deepEqual([...c.orderMeasureScopes(legacy)], ['decorative_film']);
  assert.equal(c.orderMeasureScope({ tags: ['privacy'] }), 'privacy_film');
});

test('measurement requires windows only for directions with a per-sq-ft service', () => {
  const offerings = [
    { id: 'solar', unit: 'sqft', serviceType: 'solar_film' },
    { id: 'zones', unit: 'zone', serviceType: 'smart_film' },
  ];
  const c = loadScopes(offerings);
  const mixed = { serviceType: 'solar_film', serviceTypes: ['solar_film', 'smart_film'], offeringIds: ['solar', 'zones'], measurements: { rooms: [] } };
  assert.deepEqual([...c.orderMeasureScopes(mixed)], ['solar_film'], 'Smart zones need no windows');
  const zonesOnly = { serviceType: 'smart_film', serviceTypes: ['smart_film'], offeringIds: ['zones'], measurements: { rooms: [] } };
  assert.deepEqual([...c.orderMeasureScopes(zonesOnly)], []);
  const withWindow = { ...zonesOnly, measurements: { rooms: [{ windows: [{ measureScope: 'smart_film' }] }] } };
  assert.deepEqual([...c.orderMeasureScopes(withWindow)], ['smart_film'], 'a measured window keeps its scope');
  const completion = html.slice(html.indexOf('function orderMeasurementCompletionIssues(o) {'), html.indexOf('function orderTechnicalMeasurementIssues('));
  assert.match(completion, /if \(!windows\.length\) return orderNeedsMeasurements\(o\) \? \['добавьте хотя бы одно окно или панель'\] : \[\];/, 'a proposal of services without sizes can be sent');
});

test('privacy films pay the privacy rate; the material of services without sizes is listed in the cost', () => {
  assert.match(html, /if \(n\.includes\('privacy'\) \|\| n\.includes\('приват'\)\) return 'privacy';/);
  assert.match(html, /const category = catalog\?\.category \? canonicalCatalogCategory\(catalog\.category\) : filmCategory\(w\?\.filmType \|\| ''\);/);
  assert.match(html, /const directionRate = explicit != null \? explicit : c \? installerServiceRateByCategory\(canonicalCatalogCategory\(c\.category\)\) : filmRate\(filmName\);/);
  assert.match(html, /\.\.\.\(pss\.extraServicesCost > 0 \? \[\['Материал услуг без размеров', pss\.extraServicesCost\]\] : \[\]\)/);
});

test('the need for windows follows how the project priced its services, not later directory edits', () => {
  const { c, db } = loadServices();
  c.addServiceOffering('smart');
  const zone = db.settings.serviceOfferings[0];
  Object.assign(zone, { name: 'Зона', unit: 'zone', pricePerSqft: 100 });
  const order: Row = { id: 'p', offeringIds: [zone.id], extraServices: [c.projectOfferingLine(zone, 2)], measurements: { rooms: [] } };
  db.orders.push(order);
  assert.equal(c.orderNeedsMeasurements(order), false);
  zone.unit = 'sqft';
  assert.equal(c.orderNeedsMeasurements(order), false, 'the project keeps its quantity-priced service');

  c.addServiceOffering('smart');
  const film = db.settings.serviceOfferings[1];
  const quick: Row = { id: 'q', offeringIds: [film.id], extraServices: [{ id: 'l', quickProjectLine: true }], measurements: { rooms: [] } };
  assert.equal(c.orderNeedsMeasurements(quick), true, 'a per-sq-ft service needs windows even next to old quick lines');
  assert.equal(c.orderNeedsMeasurements({ extraServices: [{ id: 'l', quickProjectLine: true }] }), false, 'a quick-entry-only project does not');
});

test('the server accepts only services without sizes as lines and prices them itself', () => {
  const view: Row = serviceSolutionsForViewer(base, false);
  view.orders[0].extraServices = [{ id: 'bad', type: 'offering', offeringId: 'one-way', serviceType: 'privacy_film', qty: 2, unitPrice: 1, price: 2 }];
  assert.match(prepareServiceSolutions(base, view, false)!, /по замеру окон/);
  view.orders[0].extraServices = [{ id: 'zones', type: 'offering', offeringId: 'zone', serviceType: 'smart_film', qty: 3, unitPrice: 1, price: 3, unit: 'sqft' }];
  assert.equal(prepareServiceSolutions(base, view, false), null);
  const line = view.orders[0].extraServices[0];
  assert.deepEqual([line.unit, line.unitPrice, line.price], ['zone', 100, 300], 'unit and price come from the directory');
  // Later the manager may change only the quantity; the saved unit price stays.
  const saved: Row = structuredClone(view);
  saved.settings.serviceOfferings[1].pricePerSqft = 100;
  const next: Row = structuredClone(saved);
  next.orders[0].extraServices[0].qty = 5;
  next.orders[0].extraServices[0].unitPrice = 1;
  assert.equal(prepareServiceSolutions(saved, next, false), null);
  assert.deepEqual([next.orders[0].extraServices[0].unitPrice, next.orders[0].extraServices[0].price], [100, 500]);
  next.orders[0].extraServices[0].qty = -1;
  assert.match(prepareServiceSolutions(saved, next, false)!, /Количество/);
});

test('a project of services without sizes opens its estimate and shows them to the client', () => {
  const card = html.slice(html.indexOf('function renderOrderCleanDetails'), html.indexOf('\nfunction ', html.indexOf('function renderOrderCleanDetails') + 20));
  assert.match(card, /const estimateReady = hasMeasurements \|\| !orderNeedsMeasurements\(o\);/);
  assert.match(card, /disabled: !canManage \|\| !estimateReady/);
  assert.match(card, /onclick: estimateReady \? `openProjectEstimateWorkspace\('\$\{o\.id\}'\)` : `openManagerMeasureModal\('\$\{o\.id\}'\)`/);
  assert.match(html, /setTimeout\(\(\) => \(orderNeedsMeasurements\(o\) \? openManagerMeasureModal\(o\.id\) : openProjectEstimateWorkspace\(o\.id\)\), 0\);/);
  assert.match(html, /projectOfferingLines\(order\)\.length \? `<div class="pp-panel"><div class="text-xs text-blue-200 font-bold">PROJECT SERVICES<\/div>/);
});

test('the server classifies service lines itself: submitted flags cannot unlock a price or skip the size rule', () => {
  const view: Row = serviceSolutionsForViewer(base, false);
  // A line with a directory service but no «offering» type is still a priced quantity line.
  view.orders[0].extraServices = [{ id: 'z', offeringId: 'zone', serviceType: 'smart_film', qty: 2, unitPrice: 1, price: 2 }];
  assert.equal(prepareServiceSolutions(base, view, false), null);
  assert.deepEqual([view.orders[0].extraServices[0].type, view.orders[0].extraServices[0].price], ['offering', 200]);
  // Turning a saved quantity line into a «quick» line keeps it a quantity line.
  const saved: Row = structuredClone(view);
  const next: Row = structuredClone(saved);
  Object.assign(next.orders[0].extraServices[0], { quickProjectLine: true, type: 'custom', unitPrice: 1, price: 1 });
  assert.equal(prepareServiceSolutions(saved, next, false), null);
  assert.deepEqual([next.orders[0].extraServices[0].quickProjectLine, next.orders[0].extraServices[0].type, next.orders[0].extraServices[0].price], [undefined, 'offering', 200]);
  // A new quick line may use only a per-sq-ft service.
  const quick: Row = structuredClone(saved);
  quick.orders[0].extraServices.push({ id: 'q', quickProjectLine: true, offeringId: 'zone', serviceType: 'smart_film', unit: 'sqft', qty: 10 });
  assert.match(prepareServiceSolutions(saved, quick, false)!, /кв\. футам/);
});

test('installers see services without sizes in the work order and tech sheet, without prices', () => {
  const rows = html.slice(html.indexOf('function projectOfferingScopeRows(order) {'), html.indexOf('function renderWorkOrderHtml('));
  assert.match(rows, /serviceOfferingUnitShort\(line\)/);
  assert.doesNotMatch(rows, /price|fmtMoney/i);
  assert.match(html, /<div class="wo-block-title">Услуги без размеров<\/div>/);
  assert.match(html, /\$\{projectOfferingLines\(order\)\.length \? `<div class="mb-5"><h3 class="font-black mb-2">Услуги без размеров<\/h3>/);
  assert.match(html, /onclick: `openWorkOrder\('\$\{o\.id\}'\)`, disabled: !ctx\.hasMeasurements && !projectOfferingLines\(o\)\.length, primary: true/);
  assert.match(html, /onclick: `printTechnicalSheet\('\$\{o\.id\}'\)`, disabled: !hasMeasurements && !projectOfferingLines\(o\)\.length/);
  // The field payload drops every money key of these lines (price, unitPrice, material cost).
  const field = readFileSync('src/features/legacy-crm/field-workspace.ts', 'utf8');
  assert.match(field, /const FINANCIAL_KEY = \/\(\?:price\|[^/]*cost[^/]*\)\/i;/);
});

test('a project keeps the unit each service had when it was chosen', () => {
  const { c, db } = loadServices();
  c.addServiceOffering('smart');
  const film = db.settings.serviceOfferings[0];
  const order: Row = { id: 'm', offeringIds: [film.id], offeringUnits: { [film.id]: 'sqft' }, extraServices: [], measurements: { rooms: [] } };
  film.unit = 'zone';
  assert.equal(c.orderNeedsMeasurements(order), true, 'chosen per sq ft: still needs windows');
  assert.match(html, /offeringUnits: Object\.fromEntries\(selectedOfferings\.map\(item => \[item\.id, serviceOfferingUnit\(item\)\]\)\),/);

  const next: Row = structuredClone(base);
  next.orders[0].offeringUnits = { zone: 'sqft' };
  assert.match(prepareServiceSolutions(base, next, false)!, /не совпадает/);
  next.orders[0].offeringUnits = { zone: 'zone' };
  assert.equal(prepareServiceSolutions(base, next, false), null);
  const later: Row = structuredClone(next);
  later.orders[0].offeringUnits = { zone: 'sqft' };
  assert.match(prepareServiceSolutions(next, later, false)!, /нельзя изменить/);
  const dropped: Row = structuredClone(next);
  delete dropped.orders[0].offeringUnits;
  assert.equal(prepareServiceSolutions(next, dropped, false), null);
  assert.deepEqual({ ...dropped.orders[0].offeringUnits }, { zone: 'zone' }, 'a saved unit cannot be dropped either');
});

test('services chosen before units existed stay per sq ft, whatever the directory says now', () => {
  const { c, db } = loadServices();
  c.addServiceOffering('smart');
  const service = db.settings.serviceOfferings[0];
  service.unit = 'zone';
  const old: Row = { id: 'old', offeringIds: [service.id], extraServices: [], measurements: { rooms: [] } };
  assert.equal(c.orderNeedsMeasurements(old), true);
});


test('managers open the work order of a size-free project from the passport, the order card and production prep', () => {
  const card = html.slice(html.indexOf('const hasWorkScope = hasMeasurements || projectOfferingLines(o).length > 0;'), html.indexOf('function openProjectProductionWorkspace('));
  assert.ok(card.length > 0);
  assert.doesNotMatch(card, /openWorkOrder\('\$\{o\.id\}'\)`, disabled: !hasMeasurements/);
  assert.doesNotMatch(card, /openTechnicalSheet\('\$\{o\.id\}'\)`, disabled: !hasMeasurements/);
  assert.equal((html.match(/openWorkOrder\('\$\{o\.id\}'\)`, disabled: !hasWorkScope/g) || []).length, 3);
  const passportWorkOrder = html.slice(html.indexOf("{ key: 'workorder', icon: '📋', title: 'Заказ-наряд',"), html.indexOf("{ key: 'route', icon: '🧭'"));
  assert.match(passportWorkOrder, /disabled: !ctx\.hasMeasurements && !projectOfferingLines\(o\)\.length/);
  const production = html.slice(html.indexOf('function openProjectProductionWorkspace('), html.indexOf('function openProjectProductionWorkspace(') + 6000);
  assert.match(production, /disabled: !measureAllWindows\(o\)\.length && !projectOfferingLines\(o\)\.length/);
  assert.match(production, /projectOfferingScopeRows\(o\)/);
});
