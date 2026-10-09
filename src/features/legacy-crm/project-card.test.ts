import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { prepareServiceSolutions } from './service-solutions';

// Owner, 2026-10-09: the project card is one working screen. While the project
// is priced its services are rows with quantity and price; once the client
// accepted the proposal (production) each row also gets its specialist and
// date, right in the row, and the schedule is built from the rows.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

function load(role = 'owner') {
  const services = [
    { id: 'protective_film', catalogCategory: 'protective', title: 'Защитная' },
    { id: 'smart_film', catalogCategory: 'smart', title: 'Смарт' },
  ];
  const db: Row = {
    settings: {
      complexityCoefs: { standard: 1 },
      installerRates: { workTypes: {} },
      catalog: [],
      serviceOfferings: [
        { id: 'a1', direction: 'protective', name: 'A1 8 mil', unit: 'sqft', pricePerSqft: 14, minPricePerUnit: 12, maxPricePerUnit: 20, installerRatePerSqft: 3, includes: ['silicone'] },
        { id: 'silicone', direction: 'protective', name: 'Силикон', unit: 'lft', pricePerSqft: 3.5, installerRatePerSqft: 1 },
        { id: 'zone', direction: 'smart', name: 'Подключение зоны', unit: 'zone', pricePerSqft: 100, installerRatePerSqft: 50 },
        { id: 'a3', direction: 'protective', name: 'A3 24 mil', unit: 'sqft', pricePerSqft: 22 },
      ],
    },
    users: [{ id: 'i1', name: 'Алан', role: 'installer' }, { id: 'i2', name: 'Рустам', role: 'installer' }, { id: 'm1', name: 'Данил', role: 'manager' }],
    orders: [] as Row[],
  };
  const calls: string[] = [];
  const context: any = vm.createContext({
    db, console, state: { currentUserId: 'u' },
    ORDER_PRIMARY_SERVICES: services,
    primaryServiceInfo: (id: string) => services.find(item => item.id === id),
    canonicalCatalogCategory: (value: string) => value,
    currentUser: () => ({ role }),
    getUser: (id: string) => db.users.find((user: Row) => user.id === id),
    usersByRole: (r: string) => db.users.filter((user: Row) => user.role === r),
    getCatalogItem: () => undefined,
    windowCatalog: () => undefined,
    windowActualAreaSqft: (win: Row) => Number(win.sqft) || 0,
    warehouseCatalogCostPerSqft: () => 0,
    filmRate: () => 2.5,
    installerServiceRateByCategory: () => 2.5,
    measureAllWindows: (o: Row) => (o.measurements?.rooms || []).flatMap((room: Row) => (room.windows || []).map((win: Row) => ({ room, win }))),
    projectQuickLines: (o: Row) => (o.extraServices || []).filter((line: Row) => line.quickProjectLine),
    orderUserCanSeeMoney: () => role !== 'installer',
    orderUserCanManage: () => role !== 'installer',
    orderRevenue: (o: Row) => context.projectLines(o).reduce((sum: number, line: Row) => sum + line.price, 0),
    fmtMoney: (value: number) => `$${Number(value).toFixed(2)}`,
    fmtDateTime: (value: string) => String(value).slice(0, 16),
    datetimeLocalValue: (value: string) => String(value).slice(0, 16),
    projectQuickDateValue: (value: string) => value,
    jsQuote: (value: unknown) => String(value ?? ''),
    academyEsc: (value: unknown) => String(value ?? ''),
    renderOrderActionCard: (card: Row) => `<card ${card.title} | ${card.sub} | ${card.onclick}>`,
    offeringServiceType: (offering: Row) => ({ protective: 'protective_film', smart: 'smart_film' } as Row)[offering?.direction] || '',
    projectEstimateMarkChanged: (o: Row, note: string) => calls.push(`changed:${note}`),
    save: () => calls.push('save'),
    render: () => calls.push('render'),
    preservePositionForNextRender: () => undefined,
    alert: (message: string) => calls.push(`alert:${message}`),
  });
  const start = html.indexOf('// ---------- УСЛУГИ ВНУТРИ НАПРАВЛЕНИЙ');
  vm.runInContext(html.slice(start, html.indexOf('function projectQuickLineCatalog(', start)), context);
  vm.runInContext(html.slice(html.indexOf('function windowRetailPrice('), html.indexOf('function orderInstallerPayout(o)')), context);
  vm.runInContext(html.slice(html.indexOf('function installerAdditionalWorkRate('), html.indexOf('function orderAdditionalWorkPayoutForUser(')), context);
  return { c: context, db, calls };
}

const win = (id: string, sqft: number, offeringId = 'a1') => ({ id, sqft, offeringId, offeringName: 'A1 8 mil', pricePerSqft: 14, measureScope: 'protective_film' });

function project(status = 'measurement_done'): Row {
  return {
    id: 'o', status, serviceType: 'protective_film', offeringId: 'a1', offeringIds: ['a1', 'zone', 'a3'], offeringUnits: { a1: 'sqft', zone: 'zone', a3: 'sqft' },
    measurements: { rooms: [{ id: 'r', windows: [win('w1', 10), win('w2', 20)] }] },
    extraServices: [
      { id: 's', type: 'offering', offeringId: 'silicone', includedBy: 'a1', unit: 'lft', qty: 40, unitPrice: 0, price: 0, serviceType: 'protective_film', offeringName: 'Силикон' },
      { id: 'z', type: 'offering', offeringId: 'zone', unit: 'zone', qty: 3, unitPrice: 100, price: 300, serviceType: 'smart_film', offeringName: 'Подключение зоны' },
    ],
  };
}

test('while priced, the card shows services with quantity and price only; a per-sq-ft service waits for the measurement', () => {
  const { c } = load();
  const out = c.renderProjectCardServices(project(), { money: true, economics: true, manage: true });
  assert.doesNotMatch(out, /<th>Исполнитель<\/th>|<th>Дата<\/th>/, 'no specialist or date before the proposal is accepted');
  assert.match(out, /Исполнители появятся, когда клиент примет КП/);
  assert.match(out, /onchange="projectCardSetQty\('o','z',this\.value\)"/, 'the quantity is edited in the row');
  assert.match(out, /onchange="projectCardSetPrice\('o','offering:a1',this\.value\)"/, 'the per-sq-ft price of the windows is edited in the row');
  assert.match(out, /от \$12\.00 до \$20\.00/);
  assert.doesNotMatch(out, /projectCardSetPrice\('o','line:z'/, 'a price without a manager range follows the directory');
  assert.match(out, /data-project-pending="a3"[\s\S]*ждёт замера[\s\S]*projectCardRemovePending\('o','a3'\)/);
  assert.match(out, /onchange="if \(this\.value\) projectCardAddService\('o', this\.value\)"/);
  assert.match(out, /клиенту \$720\.00/);
  assert.match(out, /материал \$0\.00<\/span><span class="text-gray-500">специалистам \$280\.00/);
  // The incoming request cannot be removed from its own project.
  const own = project();
  own.measurements.rooms[0].windows = [];
  assert.doesNotMatch(c.renderProjectCardServices(own, { money: true, manage: true }), /projectCardRemovePending\('o','a1'\)/);
});

test('in production each row gets its specialist and date; the schedule is built from the rows', () => {
  const { c } = load();
  const o = project('proposal_accepted');
  o.serviceSchedules = [{ id: 'offering:a1', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] }];
  const out = c.renderProjectCardServices(o, { money: true, economics: false, manage: true });
  assert.match(out, /<th>Исполнитель<\/th><th>Дата<\/th>/);
  assert.match(out, /projectCardToggleCrew\('o','offering:a1','i1',this\.checked\)/);
  assert.match(out, /type="datetime-local" class="" style="min-width:180px" value="2026-10-14T16:00" aria-label="Дата: A1 8 mil" onchange="projectCardSetDate\('o','offering:a1',this\.value\)"/);
  assert.match(out, /<b>2026-10-14T16:00<\/b> · Алан<\/span><span class="text-sm text-gray-600">A1 8 mil — 30 sq ft/);
  assert.match(out, /Не назначено: Силикон, Подключение зоны/);
  assert.match(out, /<card Подтвердить монтаж \| сначала назначьте: 2 \| projectCardConfirmInstallation\('o'\)>/);
  // A field specialist sees who and when, but cannot plan or see money.
  const field = load('installer').c.renderProjectCardServices(o, { money: false, manage: false });
  assert.doesNotMatch(field, /\$|projectCardToggleCrew|projectCardSetQty/);
  assert.match(field, /Алан/);
});

test('planning in the row keeps the other lines\' old crew and fills the project crew and date', () => {
  const { c, calls } = load();
  const o = project('proposal_accepted');
  o.installerIds = ['i2'];
  o.installationAt = '2026-10-20T16:00:00.000Z';
  c.db.orders.push(o);
  c.getOrder = (id: string) => c.db.orders.find((item: Row) => item.id === id);
  c.projectCardToggleCrew('o', 'line:z', 'i1', true);
  // The first plan writes every line's current assignment (the old project-wide crew), then changes one.
  assert.deepEqual(plain(o.serviceSchedules.map((item: Row) => [item.id, item.installerIds, item.installationAt])), [
    ['offering:a1', ['i2'], '2026-10-20T16:00:00.000Z'],
    ['line:s', ['i2'], '2026-10-20T16:00:00.000Z'],
    ['line:z', ['i2', 'i1'], '2026-10-20T16:00:00.000Z'],
  ]);
  c.projectCardSetDate('o', 'line:z', '2026-10-15T09:00');
  assert.equal(o.installationAt, new Date('2026-10-15T09:00').toISOString(), 'the project date is the first one');
  c.projectCardToggleCrew('o', 'line:z', 'i2', false);
  c.projectCardSetDate('o', 'line:s', '');
  assert.deepEqual(plain(o.installerIds), ['i2', 'i1']);
  assert.ok(calls.includes('save'));
  // A manager cannot plan before the proposal is accepted, nor pick someone who is not a field specialist.
  const early = project('measurement_done');
  c.db.orders.push({ ...early, id: 'e' });
  c.projectCardToggleCrew('e', 'line:z', 'i1', true);
  assert.equal(c.db.orders.find((item: Row) => item.id === 'e').serviceSchedules, undefined);
  c.projectCardToggleCrew('o', 'line:z', 'm1', true);
  assert.ok(!o.serviceSchedules.find((item: Row) => item.id === 'line:z').installerIds.includes('m1'));
});

test('a quick line planned in its row keeps its own crew and start date for pay', () => {
  const { c } = load();
  const o: Row = { id: 'q', status: 'proposal_accepted', serviceType: 'protective_film', measurements: { rooms: [] }, extraServices: [{ id: 'k', quickProjectLine: true, unit: 'sqft', qty: 10, price: 100, serviceType: 'protective_film' }] };
  c.db.orders.push(o);
  c.getOrder = (id: string) => c.db.orders.find((item: Row) => item.id === id);
  c.projectCardToggleCrew('q', 'line:k', 'i1', true);
  c.projectCardSetDate('q', 'line:k', '2026-10-16T08:30');
  assert.deepEqual(plain([o.extraServices[0].installerIds, o.extraServices[0].startDate]), [['i1'], '2026-10-16']);
});

test('prices in the row respect the owner\'s range; windows of a service share their price', () => {
  const { c, calls } = load();
  const o = project();
  c.db.orders.push(o);
  c.getOrder = (id: string) => c.db.orders.find((item: Row) => item.id === id);
  c.projectCardSetPrice('o', 'offering:a1', '25');
  assert.ok(calls.some(call => call.startsWith('alert:Цена «A1 8 mil»: от $12.00 до $20.00')));
  assert.deepEqual(plain(o.measurements.rooms[0].windows.map((item: Row) => item.pricePerSqft)), [14, 14]);
  c.projectCardSetPrice('o', 'offering:a1', '16');
  assert.deepEqual(plain(o.measurements.rooms[0].windows.map((item: Row) => item.pricePerSqft)), [16, 16]);
  c.projectCardSetPrice('o', 'line:z', '90');
  assert.equal(o.extraServices[1].unitPrice, 100, 'no range — the directory price stays');
  c.db.settings.serviceOfferings.find((item: Row) => item.id === 'zone').minPricePerUnit = 80;
  c.projectCardSetPrice('o', 'line:z', '90');
  assert.deepEqual([o.extraServices[1].unitPrice, o.extraServices[1].price], [90, 270]);
  c.projectCardSetPrice('o', 'line:s', '5');
  assert.equal(o.extraServices[0].unitPrice, 0, 'an included service stays free');
});

test('card edits reuse the estimate edits and stay on the card', () => {
  const refresh = html.slice(html.indexOf('function refreshProjectEstimateWorkspace(oid) {'), html.indexOf('function refreshProjectEstimateWorkspace(oid) {') + 400);
  assert.match(refresh, /if \(projectCardEditing\) \{ preservePositionForNextRender\(\); render\(\); return; \}/);
  assert.match(html, /function projectCardSetQty\(oid, sid, value\) \{\n  projectCardEdit\(\(\) => projectEstimateUpdateService\(oid, sid, 'qty', value\)\);/);
  assert.match(html, /function projectCardAddService\(oid, offeringId\) \{\n  projectCardEdit\(\(\) => projectAddOfferingLine\(oid, offeringId\)\);/);
  const confirm = html.slice(html.indexOf('function projectCardConfirmInstallation(oid) {'), html.indexOf('function projectCardCrewPicker('));
  for (const guard of ['projectCardUnplanned(o)', "ensureVerifiedMeasurementsForStatus(o, 'installation_scheduled')", 'orderTechnicalMeasurementIssues(o)', 'ensureProductionReadyForInstallation(o)', "changeStatus(oid, 'installation_scheduled'"]) assert.ok(confirm.includes(guard), guard);
});

test('server: a row may be planned step by step; «Монтаж назначен» needs every specialist and date', () => {
  const base = (): Row => ({ settings: { serviceOfferings: [] }, users: [{ id: 'i1', role: 'installer' }], orders: [{ id: 'o', status: 'proposal_accepted', extraServices: [], measurements: { rooms: [] } }] });
  const partial = base();
  partial.orders[0].serviceSchedules = [{ id: 'line:z', installationAt: '', installerIds: ['i1'] }, { id: 'line:s', installationAt: '2026-10-14T16:00:00.000Z', installerIds: [] }];
  assert.equal(prepareServiceSolutions(base(), partial, false), null);
  assert.deepEqual([partial.orders[0].installerIds, partial.orders[0].installationAt], [['i1'], '2026-10-14T16:00:00.000Z']);
  const badDate = base();
  badDate.orders[0].serviceSchedules = [{ id: 'line:z', installationAt: 'tomorrow', installerIds: [] }];
  assert.equal(prepareServiceSolutions(base(), badDate, false), 'Некорректная дата услуги.');
  const scheduled = structuredClone(partial);
  scheduled.orders[0].status = 'installation_scheduled';
  assert.equal(prepareServiceSolutions(partial, scheduled, false), 'Укажите дату и исполнителей каждой услуги.');
  const complete = structuredClone(partial);
  complete.orders[0].serviceSchedules = [{ id: 'line:z', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] }];
  const done = structuredClone(complete);
  done.orders[0].status = 'installation_scheduled';
  assert.equal(prepareServiceSolutions(complete, done, false), null);
});

test('a finished project shows its plan read-only; after «Монтаж назначен» a planned row keeps a specialist and a date', () => {
  const { c, calls } = load();
  c.getOrder = (id: string) => c.db.orders.find((item: Row) => item.id === id);
  const closed = project('completed');
  closed.id = 'done';
  closed.serviceSchedules = [{ id: 'offering:a1', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] }];
  c.db.orders.push(closed);
  const out = c.renderProjectCardServices(closed, { money: true, manage: true });
  assert.match(out, /<th>Исполнитель<\/th><th>Дата<\/th>/);
  assert.doesNotMatch(out, /projectCardToggleCrew|projectCardSetDate|Подтвердить монтаж/);
  c.projectCardToggleCrew('done', 'offering:a1', 'i2', true);
  c.projectCardSetDate('done', 'offering:a1', '');
  assert.deepEqual(plain(closed.serviceSchedules), [{ id: 'offering:a1', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] }]);

  const scheduled = project('installation_scheduled');
  scheduled.serviceSchedules = [{ id: 'offering:a1', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] }];
  c.db.orders.push(scheduled);
  c.projectCardToggleCrew('o', 'offering:a1', 'i1', false);
  c.projectCardSetDate('o', 'offering:a1', '');
  assert.ok(calls.some(call => call.startsWith('alert:Монтаж уже назначен')));
  assert.deepEqual(plain(scheduled.serviceSchedules[0]), { id: 'offering:a1', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] });
  // Replacing is fine: a new date, a second specialist, then the first one leaves.
  c.projectCardSetDate('o', 'offering:a1', '2026-10-15T09:00');
  c.projectCardToggleCrew('o', 'offering:a1', 'i2', true);
  c.projectCardToggleCrew('o', 'offering:a1', 'i1', false);
  assert.deepEqual(plain(scheduled.serviceSchedules[0].installerIds), ['i2']);
  // A service added later is planned step by step.
  c.projectCardToggleCrew('o', 'line:z', 'i1', true);
  assert.deepEqual(plain(scheduled.serviceSchedules.find((item: Row) => item.id === 'line:z')), { id: 'line:z', installationAt: '', installerIds: ['i1'] });
});

test('server: a finished project\'s plan is frozen; a scheduled one keeps every planned service complete', () => {
  const base = (status: string): Row => ({ settings: { serviceOfferings: [] }, users: [{ id: 'i1', role: 'installer' }, { id: 'i2', role: 'installer' }], orders: [{ id: 'o', status, extraServices: [], measurements: { rooms: [] }, serviceSchedules: [{ id: 'line:z', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] }] }] });
  const closed = base('completed');
  const edited = structuredClone(closed);
  edited.orders[0].serviceSchedules[0].installerIds = ['i2'];
  assert.equal(prepareServiceSolutions(closed, edited, true), 'Проект закрыт: исполнителей и даты услуг не меняют.');
  const scheduled = base('installation_scheduled');
  const emptied = structuredClone(scheduled);
  emptied.orders[0].serviceSchedules[0].installationAt = '';
  assert.equal(prepareServiceSolutions(scheduled, emptied, false), 'Монтаж назначен: у услуги должны остаться исполнитель и дата.');
  const swapped = structuredClone(scheduled);
  swapped.orders[0].serviceSchedules[0] = { id: 'line:z', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i2'] };
  swapped.orders[0].serviceSchedules.push({ id: 'line:s', installationAt: '', installerIds: ['i1'] });
  assert.equal(prepareServiceSolutions(scheduled, swapped, false), null, 'a change of crew or date, and a new service planned step by step, pass');
});
