import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { prepareServiceSolutions } from './service-solutions';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;

function load(role = 'owner') {
  const db: Row = { settings: { serviceOfferings: [] as Row[], catalog: [] }, orders: [] as Row[] };
  let sequence = 0;
  const services = [
    { id: 'protective_film', catalogCategory: 'protective', title: 'Защитная' },
    { id: 'solar_film', catalogCategory: 'solar', title: 'Солнцезащитная' },
  ];
  const context: any = vm.createContext({
    db,
    console,
    ORDER_PRIMARY_SERVICES: services,
    primaryServiceInfo: (id: string) => services.find(item => item.id === id),
    canonicalCatalogCategory: (value: string) => value,
    currentUser: () => ({ role }),
    uid: () => `id${++sequence}`,
    alert: () => undefined,
    save: () => undefined,
    render: () => undefined,
    getOrder: (id: string) => db.orders.find((order: Row) => order.id === id),
    measureAllWindows: (order: Row) => (order.measurements?.rooms || []).flatMap((room: Row) => (room.windows || []).map((win: Row) => ({ room, win }))),
    projectQuickLines: (order: Row) => (order.extraServices || []).filter((line: Row) => line.quickProjectLine),
    orderUserCanSeeMoney: () => true,
    projectEstimateMarkChanged: () => undefined,
    refreshProjectEstimateWorkspace: () => undefined,
    invalidateProjectEstimate: () => undefined,
    fmtMoney: (value: number) => `$${value}`,
    academyEsc: (value: unknown) => String(value ?? ''),
  });
  const start = html.indexOf('// ---------- УСЛУГИ ВНУТРИ НАПРАВЛЕНИЙ');
  vm.runInContext(html.slice(start, html.indexOf('function projectQuickLineCatalog(', start)), context);
  vm.runInContext(html.slice(html.indexOf('function offeringServiceType('), html.indexOf('function newOrderSelectedOfferings(')), context);
  const add = (fields: Row) => {
    const item: Row = { id: `svc_${fields.name}`, direction: 'protective', active: true, ...fields };
    db.settings.serviceOfferings.push(item);
    return item;
  };
  return { context, db, add };
}

const inch = 25.4;
const windowRow = (id: string, offeringId = '') => ({ id, width: 48 * inch, height: 36 * inch, qty: 2, measureScope: 'protective_film', offeringId });

test('linear-foot quantity is the perimeter of every pane times the window quantity', () => {
  const { context } = load();
  assert.equal(context.windowPerimeterLinearFt(windowRow('w')), 28);
  assert.equal(context.windowPerimeterLinearFt({ actualPanels: [{ width: 12 * inch, height: 24 * inch }, { width: 36 * inch, height: 24 * inch }], qty: 2 }), 32);
  assert.equal(context.windowPerimeterLinearFt({ width: 1000, height: 1000, actualWidth: 304.8, actualHeight: 304.8, qty: 1 }), 4);
  assert.equal(context.serviceOfferingUnitShort({ unit: 'lft' }), 'lin ft');
  assert.equal(context.serviceOfferingNeedsSizes({ unit: 'lft' }), false);
});

test('a package adds its included service as a separate free operational line and removes it with the parent', () => {
  const { context, db, add } = load();
  const silicone = add({ name: 'Силикон', unit: 'lft', pricePerSqft: 3.5, installerRatePerSqft: 1, materialCostPerUnit: 0.4 });
  const a1 = add({ name: 'A1 8 mil', unit: 'sqft', pricePerSqft: 14, includes: [silicone.id] });
  const order: Row = { id: 'o', serviceType: 'protective_film', serviceTypes: ['protective_film'], extraServices: [], measurements: { rooms: [{ id: 'r', windows: [windowRow('w1'), windowRow('w2')] }] } };
  db.orders.push(order);

  context.projectAddOfferingLine('o', a1.id);
  assert.deepEqual(order.measurements.rooms[0].windows.map((win: Row) => win.offeringId), [a1.id, a1.id]);
  assert.equal(order.extraServices.length, 1);
  const line = order.extraServices[0];
  assert.deepEqual([line.offeringId, line.includedBy, line.unit, line.qty, line.unitPrice, line.price], [silicone.id, a1.id, 'lft', 56, 0, 0]);
  assert.equal(context.serviceOfferingInstallerRate(line), 1);

  order.measurements.rooms[0].windows.pop();
  assert.equal(context.syncProjectIncludedServices(order), true);
  assert.equal(line.qty, 28);
  line.qtyManual = true;
  line.qty = 30;
  context.syncProjectIncludedServices(order);
  assert.equal(line.qty, 30);

  order.serviceSchedules = [{ id: `line:${line.id}`, installationAt: '2026-10-08T10:00:00.000Z', installerIds: ['u1'] }];
  order.measurements.rooms[0].windows[0].offeringId = '';
  context.syncProjectIncludedServices(order);
  assert.equal(order.extraServices.length, 0);
  assert.deepEqual(order.serviceSchedules, []);
  assert.doesNotMatch(JSON.stringify(order.offeringIds), new RegExp(silicone.id));
});

test('linear-foot work sold alone follows all windows and an included line cannot be deleted in the UI', () => {
  const { context, db, add } = load();
  const silicone = add({ name: 'Силикон', unit: 'lft', pricePerSqft: 3.5 });
  const order: Row = { id: 'o', serviceType: 'protective_film', serviceTypes: ['protective_film'], extraServices: [], measurements: { rooms: [{ id: 'r', windows: [windowRow('w1')] }] } };
  db.orders.push(order);
  context.projectAddOfferingLine('o', silicone.id);
  assert.deepEqual([order.extraServices[0].qty, order.extraServices[0].price, order.extraServices[0].includedBy], [28, 98, undefined]);
  const remover = html.slice(html.indexOf('function projectEstimateDeleteService('), html.indexOf('function projectEstimateServiceQtyFromWindows('));
  assert.match(remover, /some\(s => s\.id === sid && s\.includedBy\)\) return/);
});

test('removing a component from the directory does not rewrite an existing project package', () => {
  const { context, db, add } = load();
  const silicone = add({ name: 'Силикон', unit: 'lft', pricePerSqft: 3.5 });
  const a1 = add({ name: 'A1 8 mil', unit: 'sqft', pricePerSqft: 14, includes: [silicone.id] });
  const order: Row = { id: 'o', serviceType: 'protective_film', serviceTypes: ['protective_film'], extraServices: [], measurements: { rooms: [{ id: 'r', windows: [windowRow('w1', a1.id)] }] } };
  db.orders.push(order);
  context.syncProjectIncludedServices(order);
  a1.includes = [];
  context.syncProjectIncludedServices(order);
  assert.equal(order.extraServices.length, 1);
});

test('package editing is one level, size-free and does not trigger a full CRM render', () => {
  const { context, add } = load();
  const silicone = add({ name: 'Силикон', unit: 'lft' });
  const a1 = add({ name: 'A1 8 mil', unit: 'sqft' });
  const film = add({ name: 'Anti-graffiti', unit: 'sqft' });
  context.toggleServiceOfferingInclude(a1.id, silicone.id, true);
  assert.deepEqual([...a1.includes], [silicone.id]);
  context.toggleServiceOfferingInclude(a1.id, film.id, true);
  assert.deepEqual([...a1.includes], [silicone.id]);
  const handler = html.slice(html.indexOf('function toggleServiceOfferingInclude('), html.indexOf('function serviceOfferingIncludesEditorHtml('));
  assert.doesNotMatch(handler, /\brender\(\)/);
  assert.match(handler, /refreshServiceOfferingIncludesSummary/);
});

const directory = [
  { id: 'silicone', direction: 'protective', name: 'Силикон', unit: 'lft', pricePerSqft: 3.5, minPricePerUnit: 2 },
  { id: 'a1', direction: 'protective', name: 'A1 8 mil', unit: 'sqft', pricePerSqft: 14, includes: ['silicone'] },
  { id: 'plain', direction: 'protective', name: '8 mil', unit: 'sqft', pricePerSqft: 12 },
];
const base = (): Row => ({
  settings: { serviceOfferings: structuredClone(directory), catalog: [] },
  users: [],
  orders: [{ id: 'o', serviceType: 'protective_film', extraServices: [], measurements: { rooms: [{ windows: [{ id: 'w', offeringId: 'a1', measureScope: 'protective_film' }] }] } }],
});
const includedLine = (fields: Row = {}): Row => ({ id: 'l', type: 'offering', offeringId: 'silicone', serviceType: 'protective_film', unit: 'lft', qty: 56, unitPrice: 0, price: 0, includedBy: 'a1', ...fields });

test('server accepts lft and enforces one-level size-free package definitions', () => {
  assert.equal(prepareServiceSolutions(base(), base(), true), null);
  const sized = base();
  sized.settings.serviceOfferings.find((item: Row) => item.id === 'a1').includes = ['plain'];
  assert.equal(prepareServiceSolutions(base(), sized, true), 'В состав услуги входят только услуги без размеров.');
  const nested = base();
  nested.settings.serviceOfferings.push({ id: 'kit', direction: 'protective', name: 'Kit', unit: 'fixed', includes: ['silicone'] });
  nested.settings.serviceOfferings.find((item: Row) => item.id === 'a1').includes = ['kit'];
  assert.equal(prepareServiceSolutions(base(), nested, true), 'Пакет внутри пакета не поддерживается.');
});

test('server keeps included work free only while its valid parent remains', () => {
  const next = base();
  next.orders[0].extraServices = [includedLine()];
  next.orders[0].offeringUnits = { silicone: 'lft' };
  assert.equal(prepareServiceSolutions(base(), next, false), null);
  assert.deepEqual([next.orders[0].extraServices[0].unitPrice, next.orders[0].extraServices[0].price], [0, 0]);

  const ordinary = base();
  delete ordinary.settings.serviceOfferings.find((item: Row) => item.id === 'silicone').minPricePerUnit;
  ordinary.orders[0].measurements.rooms[0].windows[0].offeringId = 'plain';
  ordinary.orders[0].extraServices = [includedLine()];
  const current = structuredClone(ordinary);
  assert.equal(prepareServiceSolutions(current, ordinary, false), null);
  assert.equal(ordinary.orders[0].extraServices[0].includedBy, undefined);
  assert.deepEqual([ordinary.orders[0].extraServices[0].unitPrice, ordinary.orders[0].extraServices[0].price], [3.5, 196]);
});

test('server restores an included line deleted or repointed without removing its parent', () => {
  const saved = base();
  saved.orders[0].extraServices = [includedLine()];
  saved.orders[0].offeringUnits = { silicone: 'lft' };

  const deleted = structuredClone(saved);
  deleted.orders[0].extraServices = [];
  assert.equal(prepareServiceSolutions(saved, deleted, false), null);
  assert.deepEqual([deleted.orders[0].extraServices[0].id, deleted.orders[0].extraServices[0].includedBy, deleted.orders[0].extraServices[0].price], ['l', 'a1', 0]);

  const repointed = structuredClone(saved);
  repointed.orders[0].extraServices[0].offeringId = 'plain';
  delete repointed.orders[0].extraServices[0].includedBy;
  assert.equal(prepareServiceSolutions(saved, repointed, false), null);
  assert.deepEqual([repointed.orders[0].extraServices[0].offeringId, repointed.orders[0].extraServices[0].includedBy], ['silicone', 'a1']);

  const parentRemoved = structuredClone(saved);
  parentRemoved.orders[0].measurements.rooms[0].windows[0].offeringId = 'plain';
  parentRemoved.orders[0].extraServices = [];
  assert.equal(prepareServiceSolutions(saved, parentRemoved, false), null);
  assert.deepEqual(parentRemoved.orders[0].extraServices, []);
});

test('readiness exempts included lines and proposals omit their zero-dollar rows', () => {
  const readiness = html.slice(html.indexOf('function projectEstimateReadiness(o) {'), html.indexOf('function projectQuickLines(o) {'));
  assert.match(readiness, /!line\.includedBy && !\(Number\(line\.unitPrice\) > 0\)/);
  assert.match(html, /projectOfferingLines\(order\)\.filter\(line => premiumNum\(line\.price\) > 0\)/);
});
