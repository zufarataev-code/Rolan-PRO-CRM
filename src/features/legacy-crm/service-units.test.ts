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
  assert.match(html, /if \(type === 'privacy_film' \|\| tags\.includes\('privacy'\)\) return 'privacy_film';/);
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
  assert.match(creation, /if \(nextStep === 'measure' && orderNeedsMeasurements\(o\)\) setTimeout/);
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
