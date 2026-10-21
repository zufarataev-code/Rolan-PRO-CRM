import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Касса услуг (Owner, 2026-10-19): services enter a project as cards —
// direction → service → material → add-ons — and land through the same
// projectAddOfferingLine path the dropdown used, so nothing downstream changes.

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;

function load(role = 'owner') {
  const db: Row = { settings: { serviceOfferings: [] as Row[], catalog: [] as Row[] }, orders: [] as Row[] };
  const state: Row = { modal: null };
  let sequence = 0;
  const calls: string[] = [];
  const services = [
    { id: 'protective_film', catalogCategory: 'protective', title: 'Защитная', short: 'Защита', icon: '🛡' },
    { id: 'solar_film', catalogCategory: 'solar', title: 'Солнцезащитная', short: 'Солнце', icon: '☀' },
  ];
  const context: any = vm.createContext({
    db,
    state,
    console,
    ORDER_PRIMARY_SERVICES: services,
    CLOSED_PROJECT_STATUSES: ['completed'],
    primaryServiceInfo: (id: string) => services.find(item => item.id === id),
    canonicalCatalogCategory: (value: string) => value,
    currentUser: () => ({ role }),
    uid: () => `id${++sequence}`,
    alert: () => undefined,
    save: () => calls.push('save'),
    render: () => calls.push('render'),
    closeModal: () => { state.modal = null; calls.push('closeModal'); },
    preservePositionForNextRender: () => undefined,
    openProjectEstimateWorkspace: (oid: string) => calls.push(`estimate:${oid}`),
    getOrder: (id: string) => db.orders.find((order: Row) => order.id === id),
    getCatalogItem: (id: string) => db.settings.catalog.find((item: Row) => item.id === id),
    catalogLabel: (film: Row) => (film ? film.model : '—'),
    catalogFilmName: (film: Row) => film?.productName || '',
    catalogFilmModel: (film: Row) => film?.modelCode || '',
    catalogFilmCategory: (film: Row) => film?.category || '',
    measureAllWindows: (order: Row) => (order.measurements?.rooms || []).flatMap((room: Row) => (room.windows || []).map((win: Row) => ({ room, win }))),
    projectQuickLines: (order: Row) => (order.extraServices || []).filter((line: Row) => line.quickProjectLine),
    orderUserCanSeeMoney: () => role === 'owner' || role === 'manager',
    projectEstimateMarkChanged: () => undefined,
    // The real projectCardEdit is in the loaded slice; it sets projectCardEditing while the edit runs.
    refreshProjectEstimateWorkspace: () => calls.push(vm.runInContext('projectCardEditing', context) ? 'refresh:card' : 'refresh'),
    invalidateProjectEstimate: () => undefined,
    orderServiceCardStyle: (id: string) => `--svc-color:${id};`,
    fmtMoney: (value: number) => `$${value}`,
    jsQuote: (value: string) => value,
    academyEsc: (value: unknown) => String(value ?? ''),
  });
  const start = html.indexOf('// ---------- УСЛУГИ ВНУТРИ НАПРАВЛЕНИЙ');
  vm.runInContext(html.slice(start, html.indexOf('function projectQuickLineCatalog(', start)), context);
  vm.runInContext(html.slice(html.indexOf('function offeringServiceType('), html.indexOf('function newOrderSelectedOfferings(')), context);
  vm.runInContext(html.slice(html.indexOf('function projectOfferingCatalogId('), html.indexOf('function projectSelectedSizedOfferings(')), context);
  vm.runInContext(html.slice(html.indexOf('function projectServicePriceRange('), html.indexOf('function projectCardAddService(')), context);
  const add = (fields: Row) => {
    const item: Row = { id: `svc_${fields.name}`, direction: 'protective', active: true, ...fields };
    db.settings.serviceOfferings.push(item);
    return item;
  };
  return { context, db, state, add, calls };
}

const inch = 25.4;
const windowRow = (id: string) => ({ id, width: 48 * inch, height: 36 * inch, qty: 1, measureScope: 'protective_film', offeringId: '' });

function fixture(role = 'owner') {
  const t = load(role);
  const { db, add } = t;
  db.settings.catalog.push(
    { id: 'f_a1', productName: 'MAGNITRONIC Guard', modelCode: 'A1', model: 'Guard A1', category: 'protective', vlt: 88, archived: false },
    { id: 'f_a1x', productName: 'MAGNITRONIC Guard', modelCode: 'A1X', model: 'Guard A1X', category: 'protective', archived: true },
  );
  const silicone = add({ name: 'Силикон', unit: 'lft', pricePerSqft: 3.5 });
  const high = add({ name: 'Высотные работы', unit: 'zone', pricePerSqft: 120 });
  const a1 = add({ name: 'A1 8 mil', unit: 'sqft', pricePerSqft: 14, includes: [silicone.id], filmIds: ['f_a1', 'f_a1x'] });
  add({ name: 'Солнце SP35', direction: 'solar', unit: 'sqft', pricePerSqft: 9 });
  add({ name: 'Выключена', unit: 'piece', pricePerSqft: 1, active: false });
  const order: Row = { id: 'o', number: 'P-1', status: 'new', serviceType: 'protective_film', serviceTypes: ['protective_film'], extraServices: [], measurements: { rooms: [{ id: 'r', windows: [windowRow('w1'), windowRow('w2')] }] } };
  db.orders.push(order);
  return { ...t, order, a1, silicone, high };
}

test('the picker is the cashier button; it opens on the first step only for people who may price', () => {
  const { context, order, state } = fixture();
  assert.match(context.projectOfferingPickerHtml(order, 'projectCardAddService'), /openServiceCashier\('o','card'\)/);
  assert.match(context.projectOfferingPickerHtml(order), /openServiceCashier\('o','estimate'\)/);
  context.openServiceCashier('o', 'card');
  const c = context.serviceCashierState();
  assert.deepEqual([c.oid, c.returnTo, c.step], ['o', 'card', 'direction']);
  assert.match(state.modal, /КАССА УСЛУГ · P-1/);
  assert.match(state.modal, /serviceCashierPick\('direction','protective_film'\)/);
  assert.match(state.modal, /serviceCashierPick\('direction','solar_film'\)/);
  assert.doesNotMatch(state.modal, /Добавить в проект/, 'nothing to commit before a service is chosen');

  const installer = fixture('installer');
  installer.context.openServiceCashier('o', 'card');
  assert.equal(installer.context.serviceCashierState(), null, 'field roles cannot open the cashier even by hand');
});

test('direction → service → film → add-ons, with inactive and archived items left out', () => {
  const { context, state } = fixture();
  context.openServiceCashier('o', 'card');
  context.serviceCashierPick('direction', 'protective_film');
  assert.equal(context.serviceCashierState().step, 'offering');
  assert.match(state.modal, /A1 8 mil/);
  assert.match(state.modal, /входит: Силикон/);
  assert.doesNotMatch(state.modal, /Выключена/);
  assert.doesNotMatch(state.modal, /Солнце SP35/, 'another direction is not on this screen');

  context.serviceCashierPick('offering', 'svc_A1 8 mil');
  assert.equal(context.serviceCashierState().step, 'material', 'a per-sq-ft service with linked films asks for the film');
  assert.match(state.modal, /Guard A1|A1</);
  assert.doesNotMatch(state.modal, /A1X/, 'archived film is not offered');
  assert.match(state.modal, /Материал уточним на замере/);

  context.serviceCashierPick('material', 'f_a1');
  assert.equal(context.serviceCashierState().step, 'addons');
  assert.match(state.modal, /Высотные работы/, 'a size-free service of the direction is an add-on');
  assert.doesNotMatch(state.modal, /serviceCashierPick\('addon','svc_Силикон'\)/, 'an included component is not offered twice');
  assert.match(state.modal, /↳ Силикон<\/span><span>в пакете/);
  assert.match(state.modal, /Добавить в проект/);

  context.serviceCashierPick('addon', 'svc_Высотные работы');
  assert.deepEqual([...context.serviceCashierState().addonIds], ['svc_Высотные работы']);
  context.serviceCashierPick('addon', 'svc_Высотные работы');
  assert.deepEqual([...context.serviceCashierState().addonIds], []);
});

test('a size-free service skips the material step; going back clears the later choices', () => {
  const { context } = fixture();
  context.openServiceCashier('o', 'card');
  context.serviceCashierPick('direction', 'protective_film');
  context.serviceCashierPick('offering', 'svc_Высотные работы');
  assert.equal(context.serviceCashierState().step, 'addons');
  context.serviceCashierPick('step', 'direction');
  const c = context.serviceCashierState();
  assert.deepEqual([c.step, c.directionId, c.offeringId], ['direction', '', '']);
  context.serviceCashierPick('offering', 'svc_A1 8 mil');
  assert.equal(c.offeringId, '', 'a service cannot be chosen before its direction');
});

test('commit puts the service, its film, its package and the add-ons into the project through projectAddOfferingLine', () => {
  const { context, order, state, calls, a1, silicone, high } = fixture();
  context.openServiceCashier('o', 'card');
  context.serviceCashierPick('direction', 'protective_film');
  context.serviceCashierPick('offering', a1.id);
  context.serviceCashierPick('material', 'f_a1');
  context.serviceCashierPick('addon', high.id);
  calls.length = 0;
  context.serviceCashierCommit();

  assert.equal(state.modal, null);
  assert.equal(context.serviceCashierState(), null);
  assert.ok(calls.includes('refresh:card'), 'the card path keeps the edit on the card (projectCardEdit)');
  assert.deepEqual(order.measurements.rooms[0].windows.map((win: Row) => [win.offeringId, win.catalogId, win.filmType]), [[a1.id, 'f_a1', 'Guard A1'], [a1.id, 'f_a1', 'Guard A1']]);
  assert.equal(order.offeringCatalogIds[a1.id], 'f_a1');
  assert.deepEqual(order.extraServices.map((line: Row) => [line.offeringId, line.includedBy || null]).sort(), [[high.id, null], [silicone.id, a1.id]].sort());
  assert.deepEqual([...order.offeringIds].sort(), [a1.id, high.id, silicone.id].sort());
});

test('from the estimate workspace the cashier returns to the estimate; closing returns without changes', () => {
  const { context, order, calls } = fixture();
  context.openServiceCashier('o', 'estimate');
  context.closeServiceCashier();
  assert.deepEqual(calls.filter(call => call.startsWith('estimate')), ['estimate:o']);
  assert.equal(order.extraServices.length, 0);
  calls.length = 0;
  context.openServiceCashier('o', 'estimate');
  context.serviceCashierPick('direction', 'protective_film');
  context.serviceCashierPick('offering', 'svc_Высотные работы');
  context.serviceCashierCommit();
  assert.equal(order.extraServices.length, 1);
  assert.ok(!calls.includes('refresh:card'), 'the estimate path does not pin the edit to the card');
  assert.deepEqual(calls.filter(call => call.startsWith('estimate')), ['estimate:o']);
});

test('a closed project and a service already measured are not offered again', () => {
  const { context, order, a1, state } = fixture();
  order.status = 'completed';
  context.openServiceCashier('o', 'card');
  assert.equal(context.serviceCashierState(), null);
  order.status = 'new';
  order.offeringIds = [a1.id];
  context.openServiceCashier('o', 'card');
  context.serviceCashierPick('direction', 'protective_film');
  assert.match(state.modal, /уже в проекте/);
  context.serviceCashierPick('offering', a1.id);
  assert.equal(context.serviceCashierState().step, 'material', 'the guard is in the UI; the data path itself stays idempotent');
});
