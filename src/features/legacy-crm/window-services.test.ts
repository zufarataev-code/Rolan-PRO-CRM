import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-22 (ТЗ кассы, «Что требуется на окне»): a size-free service
// of the project — silicone by lin ft, a per-piece work — can be ticked on
// individual windows in the measurement. Ticked windows make the quantity in
// the receipt; while nothing is ticked the line still means every window, so
// projects created before this change keep their numbers.

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;

function load() {
  const db: Row = { settings: { serviceOfferings: [] as Row[], catalog: [] }, orders: [] as Row[] };
  let sequence = 0;
  const calls: string[] = [];
  const services = [{ id: 'protective_film', catalogCategory: 'protective', title: 'Защитная' }];
  const context: any = vm.createContext({
    db,
    console,
    ORDER_PRIMARY_SERVICES: services,
    primaryServiceInfo: (id: string) => services.find(item => item.id === id),
    canonicalCatalogCategory: (value: string) => value,
    currentUser: () => ({ role: 'owner' }),
    uid: () => `id${++sequence}`,
    alert: () => undefined,
    save: () => calls.push('save'),
    render: () => calls.push('render'),
    getOrder: (id: string) => db.orders.find((order: Row) => order.id === id),
    measureAllWindows: (order: Row) => (order.measurements?.rooms || []).flatMap((room: Row) => (room.windows || []).map((win: Row) => ({ room, win }))),
    projectQuickLines: (order: Row) => (order.extraServices || []).filter((line: Row) => line.quickProjectLine),
    orderUserCanSeeMoney: () => true,
    projectEstimateMarkChanged: () => undefined,
    refreshProjectEstimateWorkspace: () => undefined,
    invalidateProjectEstimate: (_o: Row, reason: string) => calls.push(`invalidate:${reason}`),
    refreshManagerMeasureModal: () => calls.push('refresh'),
    orderServiceCardStyle: () => '--svc-color:#111;',
    jsQuote: (value: string) => value,
    fmtMoney: (value: number) => `$${value}`,
    academyEsc: (value: unknown) => String(value ?? ''),
  });
  const start = html.indexOf('// ---------- УСЛУГИ ВНУТРИ НАПРАВЛЕНИЙ');
  vm.runInContext(html.slice(start, html.indexOf('function projectQuickLineCatalog(', start)), context);
  vm.runInContext(html.slice(html.indexOf('function offeringServiceType('), html.indexOf('function newOrderSelectedOfferings(')), context);
  vm.runInContext(html.slice(html.indexOf('function managerToggleWindowService('), html.indexOf('function managerSetRoomRemoval(')), context);
  const add = (fields: Row) => {
    const item: Row = { id: `svc_${fields.name}`, direction: 'protective', active: true, ...fields };
    db.settings.serviceOfferings.push(item);
    return item;
  };
  return { context, db, add, calls };
}

const inch = 25.4;
// 48×36 in, two panes: perimeter 14 lin ft per pane → 28 lin ft per window row.
const windowRow = (id: string, offeringId = '') => ({ id, width: 48 * inch, height: 36 * inch, qty: 2, measureScope: 'protective_film', offeringId });

function project(context: any, db: Row, add: (f: Row) => Row) {
  const silicone = add({ name: 'Силикон', unit: 'lft', pricePerSqft: 3.5 });
  const removal = add({ name: 'Снятие', unit: 'piece', pricePerSqft: 20 });
  const order: Row = {
    id: 'o', serviceType: 'protective_film', serviceTypes: ['protective_film'], extraServices: [],
    measurements: { rooms: [{ id: 'r', windows: [windowRow('w1'), windowRow('w2'), windowRow('w3')] }] },
  };
  db.orders.push(order);
  context.projectAddOfferingLine('o', silicone.id);
  context.projectAddOfferingLine('o', removal.id);
  const line = (id: string) => order.extraServices.find((item: Row) => item.offeringId === id);
  return { order, silicone, removal, line };
}

test('with nothing ticked a line still covers every window (legacy projects unchanged)', () => {
  const { context, db, add } = load();
  const { order, silicone, removal, line } = project(context, db, add);
  assert.equal(line(silicone.id).qty, 84);
  assert.equal(line(removal.id).qty, 1, 'per-piece work keeps its own quantity until a window is ticked');
  assert.deepEqual(context.projectWindowsForService(order, silicone.id).map((w: Row) => w.id), ['w1', 'w2', 'w3']);
  assert.deepEqual(context.projectWindowServiceLines(order).map((l: Row) => l.offeringId), [silicone.id, removal.id]);
});

test('ticking windows makes the quantity: lin ft from their perimeter, pieces from their count', () => {
  const { context, db, add, calls } = load();
  const { order, silicone, removal, line } = project(context, db, add);
  context.managerToggleWindowService('o', 'r', 'w1', silicone.id, true);
  assert.deepEqual([...order.measurements.rooms[0].windows[0].serviceIds], [silicone.id]);
  assert.equal(line(silicone.id).qty, 28);
  assert.equal(line(silicone.id).price, 98);
  context.managerToggleWindowService('o', 'r', 'w2', silicone.id, true);
  assert.equal(line(silicone.id).qty, 56);
  context.managerToggleWindowService('o', 'r', 'w1', removal.id, true);
  context.managerToggleWindowService('o', 'r', 'w3', removal.id, true);
  assert.equal(line(removal.id).qty, 4, 'two windows × qty 2 panes');
  // Untick the last window of a service → back to the legacy meaning (every window).
  context.managerToggleWindowService('o', 'r', 'w1', silicone.id, false);
  context.managerToggleWindowService('o', 'r', 'w2', silicone.id, false);
  assert.equal(line(silicone.id).qty, 84);
  assert.ok(calls.includes('save') && calls.includes('refresh'));
  assert.ok(calls.some(call => call.startsWith('invalidate:')), 'the estimate is marked stale');
  assert.equal(calls.includes('render'), false, 'no full CRM render from the measurement modal');
});

test('a manual quantity gives way once a window is ticked', () => {
  const { context, db, add } = load();
  const { silicone, line } = project(context, db, add);
  line(silicone.id).qty = 10;
  line(silicone.id).qtyManual = true;
  context.managerToggleWindowService('o', 'r', 'w3', silicone.id, true);
  assert.equal(line(silicone.id).qty, 28);
  assert.equal(line(silicone.id).qtyManual, undefined);
});

test('«на все окна» ticks every window and «снять со всех» clears them', () => {
  const { context, db, add } = load();
  const { order, silicone, line } = project(context, db, add);
  context.managerSetServiceOnAllWindows('o', silicone.id, true);
  assert.ok(order.measurements.rooms[0].windows.every((w: Row) => w.serviceIds.includes(silicone.id)));
  assert.equal(line(silicone.id).qty, 84);
  const bar = context.managerWindowServicesBarHtml('o', order);
  assert.match(bar, /3 из 3/);
  assert.match(bar, /снять со всех/);
  context.managerToggleWindowService('o', 'r', 'w3', silicone.id, false);
  const partial = context.managerWindowServicesBarHtml('o', order);
  assert.match(partial, /2 из 3/);
  assert.match(partial, /на все окна/, 'some windows ticked: the button ticks the rest');
  assert.doesNotMatch(partial, /снять со всех/);
  assert.equal(context.managerWindowServicesBarHtml('o', { ...order, measurements: { rooms: [] } }), '', 'no bar before any window');
  context.managerSetServiceOnAllWindows('o', silicone.id, false);
  assert.ok(order.measurements.rooms[0].windows.every((w: Row) => w.serviceIds.length === 0));
  assert.match(context.managerWindowServicesBarHtml('o', order), /все 3[\s\S]*на все окна/);
});

test('an included (package) service only applies to windows of its parent service', () => {
  const { context, db, add } = load();
  const silicone = add({ name: 'Силикон', unit: 'lft', pricePerSqft: 3.5 });
  const pack = add({ name: 'Пакет', unit: 'sqft', pricePerSqft: 10, includes: [silicone.id] });
  const other = add({ name: 'Другая', unit: 'sqft', pricePerSqft: 8 });
  const order: Row = {
    id: 'o', serviceType: 'protective_film', serviceTypes: ['protective_film'], extraServices: [],
    measurements: { rooms: [{ id: 'r', windows: [windowRow('w1', pack.id), windowRow('w2', pack.id), windowRow('w3', other.id)] }] },
  };
  db.orders.push(order);
  context.projectAddOfferingLine('o', pack.id);
  assert.deepEqual(order.measurements.rooms[0].windows.map((w: Row) => w.offeringId), [pack.id, pack.id, other.id]);
  const included = () => order.extraServices.find((item: Row) => item.offeringId === silicone.id);
  assert.equal(included().qty, 56, 'two parent windows');
  context.managerSetServiceOnAllWindows('o', silicone.id, true);
  assert.deepEqual(order.measurements.rooms[0].windows.map((w: Row) => (w.serviceIds || []).length), [1, 1, 0], 'w3 is not a window of the package');
  context.managerToggleWindowService('o', 'r', 'w2', silicone.id, false);
  assert.equal(included().qty, 28);
});

test('window card shows a chip per window-level service with its measure and ticked state', () => {
  const { context, db, add } = load();
  const { order, silicone, removal } = project(context, db, add);
  const win = order.measurements.rooms[0].windows[0];
  context.managerToggleWindowService('o', 'r', 'w1', silicone.id, true);
  const chips = context.managerWindowServiceChipsHtml('o', 'r', win, order);
  assert.match(chips, /Работы на этом окне/);
  assert.match(chips, new RegExp(`manager-window-service-chip active[^>]*>\\s*<input type="checkbox" checked[^>]*'${silicone.id}'`));
  assert.match(chips, /28\.0 lin ft/);
  assert.match(chips, new RegExp(`manager-window-service-chip [^>]*>\\s*<input type="checkbox" [^>]*'${removal.id}'`));
  assert.match(chips, /2 шт\./);
  assert.equal(context.managerWindowServiceChipsHtml('o', 'r', win, { ...order, extraServices: [] }), '', 'no chips without window-level services');
  // The measurement modal renders the chips on every window card and the bar in the header.
  // Chips sit with the sizes, outside the collapsed technical block (Owner's user test, 2026-10-23):
  // inside it they were hidden and every tick collapsed the block again.
  const card = html.slice(html.indexOf('<label>Площадь, sqft</label>'), html.indexOf('<div class="manager-window-notes">'));
  assert.ok(card.indexOf('managerWindowServiceChipsHtml(oid, r.id, w, o)') !== -1);
  assert.ok(card.indexOf('managerWindowServiceChipsHtml(oid, r.id, w, o)') < card.indexOf('<details class="manager-window-technical">'));
  assert.match(html, /\$\{managerMeasureProgressHtml\(o, activeScopeKey\)\}[\s\S]{0,200}\$\{managerWindowServicesBarHtml\(oid, o\)\}/);
});
