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
    refreshManualFilmNeededBy: (o: Row) => calls.push(`neededBy:${o.id}`),
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
  assert.match(out, /Это черновик: клиент и бригада увидят его после «Подтвердить монтаж»/);
  assert.match(out, /<card Подтвердить монтаж \| сначала внесите замер всех услуг \| projectCardConfirmInstallation\('o'\)>/, 'a service waiting for its measurement blocks the confirmation');
  const measured = structuredClone(o);
  measured.offeringIds = ['a1', 'zone'];
  assert.match(c.renderProjectCardServices(measured, { money: true, manage: true }), /<card Подтвердить монтаж \| сначала назначьте: 2 \| projectCardConfirmInstallation\('o'\)>/);
  // A field specialist sees who and when, but cannot plan or see money.
  const field = load('installer').c.renderProjectCardServices(o, { money: false, manage: false });
  assert.doesNotMatch(field, /\$|projectCardToggleCrew|projectCardSetQty|openManagerMeasureModal/, 'no prices, no planning and no measurement editor for the field');
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
  // At «КП принято» the plan is a draft: the project crew and date (what the client and the crew see) stay as they were.
  assert.deepEqual(plain([o.installerIds, o.installationAt]), [['i2'], '2026-10-20T16:00:00.000Z']);
  // Once installation is scheduled, the project crew and first date follow the rows.
  o.status = 'installation_scheduled';
  c.projectCardToggleCrew('o', 'line:z', 'i2', false);
  assert.equal(o.installationAt, new Date('2026-10-15T09:00').toISOString(), 'the project date is the first one');
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
  assert.deepEqual(plain([o.extraServices[0].installerIds ?? null, o.extraServices[0].startDate ?? null]), [null, null], 'a draft does not touch the line');
  // Confirming publishes the plan: the quick line gets its crew and start date.
  c.ensureVerifiedMeasurementsForStatus = () => true;
  c.orderTechnicalMeasurementIssues = () => [];
  c.ensureProductionReadyForInstallation = () => true;
  c.refreshManualFilmNeededBy = () => undefined;
  c.notifyClientEventScheduled = () => undefined;
  // changeStatus checks and publishes the plan of every service on the way into installation.
  c.changeStatus = (id: string, status: string) => { const target = c.getOrder(id); if (!c.ensureProjectServicesPlanned(target)) return false; target.status = status; return true; };
  c.projectCardConfirmInstallation('q');
  assert.deepEqual(plain([o.status, o.installerIds, o.installationAt, o.extraServices[0].installerIds, o.extraServices[0].startDate]), ['installation_scheduled', ['i1'], new Date('2026-10-16T08:30').toISOString(), ['i1'], '2026-10-16']);
  // A refused status keeps the plan a draft.
  const refused: Row = { id: 'r', status: 'proposal_accepted', serviceType: 'protective_film', measurements: { rooms: [] }, extraServices: [{ id: 'k2', quickProjectLine: true, unit: 'sqft', qty: 5, price: 50, serviceType: 'protective_film' }], serviceSchedules: [{ id: 'line:k2', installationAt: '2026-10-17T16:00:00.000Z', installerIds: ['i2'] }] };
  c.db.orders.push(refused);
  c.changeStatus = () => false;
  c.projectCardConfirmInstallation('r');
  assert.deepEqual(plain([refused.status, refused.installerIds ?? null, refused.installationAt ?? null, refused.extraServices[0].installerIds ?? null]), ['proposal_accepted', null, null, null]);
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
  // The calendar keeps a draft plan to itself until the installation is confirmed.
  assert.match(html, /if \(type === 'install' && o\.status === 'proposal_accepted' && o\.serviceSchedules\?\.length\) return \[\];/);
  const confirm = html.slice(html.indexOf('function projectCardConfirmInstallation(oid) {'), html.indexOf('function projectCardCrewPicker('));
  for (const guard of ['projectPendingSizedServices(o)', 'projectCardUnplanned(o)', "ensureVerifiedMeasurementsForStatus(o, 'installation_scheduled')", 'orderTechnicalMeasurementIssues(o)', 'ensureProductionReadyForInstallation(o)', "changeStatus(oid, 'installation_scheduled'"]) assert.ok(confirm.includes(guard), guard);
});

test('server: a row may be planned step by step; «Монтаж назначен» needs every specialist and date', () => {
  const base = (): Row => ({ settings: { serviceOfferings: [] }, users: [{ id: 'i1', role: 'installer' }], orders: [{ id: 'o', status: 'proposal_accepted', extraServices: [], measurements: { rooms: [] } }] });
  const partial = base();
  partial.orders[0].serviceSchedules = [{ id: 'line:z', installationAt: '', installerIds: ['i1'] }, { id: 'line:s', installationAt: '2026-10-14T16:00:00.000Z', installerIds: [] }];
  assert.equal(prepareServiceSolutions(base(), partial, false), null);
  assert.deepEqual([partial.orders[0].installerIds, partial.orders[0].installationAt], [undefined, undefined], 'a draft plan is not published');
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
  assert.deepEqual([done.orders[0].installerIds, done.orders[0].installationAt], [['i1'], '2026-10-15T16:00:00.000Z'], 'scheduled — the plan is published');
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
  assert.ok(calls.includes('neededBy:o'), 'the film purchase deadline follows the new date');
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

test('every way into installation needs each service planned; an older project keeps its project-wide crew', () => {
  const { c, calls } = load();
  // An older project planned as a whole: its crew and date are written per service and published.
  const legacy = project('proposal_accepted');
  legacy.offeringIds = ['a1', 'zone'];
  legacy.installerIds = ['i1'];
  legacy.installationAt = '2026-10-20T16:00:00.000Z';
  assert.equal(c.ensureProjectServicesPlanned(legacy), true);
  assert.deepEqual(plain(legacy.serviceSchedules.map((item: Row) => [item.id, item.installerIds, item.installationAt])), [
    ['offering:a1', ['i1'], '2026-10-20T16:00:00.000Z'],
    ['line:s', ['i1'], '2026-10-20T16:00:00.000Z'],
    ['line:z', ['i1'], '2026-10-20T16:00:00.000Z'],
  ]);
  // A plan that misses a service, or a service waiting for its measurement, stops it.
  const partial = project('proposal_accepted');
  partial.offeringIds = ['a1', 'zone'];
  partial.serviceSchedules = [{ id: 'offering:a1', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] }];
  assert.equal(c.ensureProjectServicesPlanned(partial), false);
  assert.ok(calls.some(call => call.startsWith('alert:Назначьте исполнителя и дату каждой услуги в карточке проекта: Силикон, Подключение зоны')));
  assert.equal(partial.installerIds, undefined, 'nothing is published');
  assert.equal(c.ensureProjectServicesPlanned(project('proposal_accepted')), false, 'A3 still waits for the measurement');
  // A project without services is not blocked.
  assert.equal(c.ensureProjectServicesPlanned({ id: 'empty', status: 'proposal_accepted', measurements: { rooms: [] }, extraServices: [] }), true);
  // changeStatus publishes a complete row plan before the older checks that read the project crew and date.
  const changeStatusSource = html.slice(html.indexOf('function changeStatus(orderId, newStatus, by, opts = {}) {'), html.indexOf('function changeStatus(orderId, newStatus, by, opts = {}) {') + 4000);
  const fn = changeStatusSource.slice(0, changeStatusSource.indexOf('\n}\n') + 2);
  vm.runInContext(fn, c);
  let productionReady = false;
  Object.assign(c, {
    // The older workflow check reads the project-wide crew and date.
    ensureOrderWorkflowTransition: (target: Row) => !!target.installerIds?.length && !!target.installationAt,
    ensureVerifiedMeasurementsForStatus: () => true,
    ensureProductionReadyForInstallation: () => productionReady,
    invalidateProjectEstimate: () => undefined, notifyStatusChange: () => undefined, autoNotifyClient: () => undefined,
  });
  const rowPlanned = project('proposal_accepted');
  rowPlanned.offeringIds = ['a1', 'zone'];
  rowPlanned.serviceSchedules = ['offering:a1', 'line:s', 'line:z'].map(id => ({ id, installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] }));
  c.db.orders.push(rowPlanned);
  c.getOrder = (id: string) => c.db.orders.find((item: Row) => item.id === id);
  assert.equal(c.changeStatus('o', 'installation_scheduled', 'u'), false, 'production not ready');
  assert.deepEqual(plain([rowPlanned.status, rowPlanned.installerIds ?? null, rowPlanned.installationAt ?? null]), ['proposal_accepted', null, null], 'a refused status keeps the plan a draft');
  productionReady = true;
  assert.equal(c.changeStatus('o', 'installation_scheduled', 'u'), true);
  assert.deepEqual(plain([rowPlanned.status, rowPlanned.installerIds, rowPlanned.installationAt]), ['installation_scheduled', ['i1'], '2026-10-14T16:00:00.000Z']);
});

test('the window price in the row is the base rate; the complexity coefficient stays on top', () => {
  const { c } = load();
  c.db.settings.complexityCoefs.ladder = 1.35;
  const o = project();
  o.complexity = 'ladder';
  c.db.orders.push(o);
  c.getOrder = (id: string) => c.db.orders.find((item: Row) => item.id === id);
  const out = c.renderProjectCardServices(o, { money: true, manage: true });
  assert.match(out, /value="14" aria-label="Цена: A1 8 mil"[^>]*> <span class="text-xs text-gray-500">\/ sq ft × 1\.35 сложность<\/span>/);
  c.projectCardSetPrice('o', 'offering:a1', '15');
  assert.deepEqual(plain(o.measurements.rooms[0].windows.map((item: Row) => item.pricePerSqft)), [15, 15]);
  assert.equal(Math.round(c.projectLines(o)[0].price * 100) / 100, 607.5, '30 sq ft × $15 × 1.35');
});

test('server: entering installation needs a complete plan for every service; imports of new projects pass', () => {
  const users = [{ id: 'i1', role: 'installer' }];
  const order = (fields: Row = {}): Row => ({ id: 'o', status: 'proposal_accepted', serviceType: 'smart_film', measurements: { rooms: [{ windows: [{ id: 'w', offeringId: 'a1' }] }] }, extraServices: [{ id: 'z', type: 'washing', qty: 1, price: 10 }], ...fields });
  const state = (fields: Row = {}): Row => ({ settings: { serviceOfferings: [] }, users, orders: [order(fields)] });
  const plan = (id: string) => ({ id, installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] });
  const into = (schedules?: Row[]) => { const next = state({ status: 'installation_scheduled', ...(schedules ? { serviceSchedules: schedules } : {}) }); return prepareServiceSolutions(state(), next, false); };
  assert.equal(into(), 'Укажите дату и исполнителей каждой услуги.', 'no plan at all');
  assert.equal(into([plan('offering:a1')]), 'Укажите дату и исполнителей каждой услуги.', 'one service left out');
  assert.equal(into([plan('offering:a1'), plan('line:z')]), null);
  const imported: Row = { settings: { serviceOfferings: [] }, users, orders: [] };
  const importedOrder = state({ status: 'installation_scheduled', measurements: { rooms: [{ windows: [{ id: 'w', measureScope: 'smart_film' }] }] } });
  assert.equal(prepareServiceSolutions(imported, importedOrder, false), null, 'a new project created as scheduled (import) is not a transition');
});


test('removing a service waiting for measurement drops its direction when nothing else of it remains', () => {
  const { c } = load();
  c.getOrder = (id: string) => c.db.orders.find((item: Row) => item.id === id);
  const o = project();
  o.offeringIds = ['a1', 'zone', 'solar-x'];
  o.serviceTypes = ['protective_film', 'smart_film', 'solar_film'];
  c.db.settings.serviceOfferings.push({ id: 'solar-x', direction: 'solar', name: 'Ceramic 70', unit: 'sqft', pricePerSqft: 9 });
  c.offeringServiceType = (offering: Row) => ({ protective: 'protective_film', smart: 'smart_film', solar: 'solar_film' } as Row)[offering?.direction] || '';
  o.offeringUnits['solar-x'] = 'sqft';
  c.db.orders.push(o);
  c.projectCardRemovePending('o', 'solar-x');
  assert.deepEqual(plain([o.offeringIds, o.serviceTypes]), [['a1', 'zone'], ['protective_film', 'smart_film']]);
  // A direction still used by another service of the project stays.
  o.offeringIds.push('a3');
  c.projectCardRemovePending('o', 'a3');
  assert.deepEqual(plain(o.serviceTypes), ['protective_film', 'smart_film']);
});

test('server: after «Монтаж назначен» a plan leaves only with its service', () => {
  const users = [{ id: 'i1', role: 'installer' }];
  const plan = (id: string) => ({ id, installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] });
  const saved: Row = { settings: { serviceOfferings: [] }, users, orders: [{ id: 'o', status: 'installation_scheduled', serviceType: 'smart_film', measurements: { rooms: [] }, extraServices: [{ id: 'z', type: 'washing', qty: 1, price: 10 }, { id: 'y', type: 'washing', qty: 1, price: 10 }], serviceSchedules: [plan('line:z'), plan('line:y')] }] };
  const dropped = structuredClone(saved);
  dropped.orders[0].serviceSchedules = [plan('line:z')];
  assert.equal(prepareServiceSolutions(saved, dropped, false), 'Монтаж назначен: у услуги должны остаться исполнитель и дата.');
  const removed = structuredClone(saved);
  removed.orders[0].extraServices = [removed.orders[0].extraServices[0]];
  removed.orders[0].serviceSchedules = [plan('line:z')];
  assert.equal(prepareServiceSolutions(saved, removed, false), null, 'the service itself was removed');
});

test('server: a service waiting for measurement stops installation; closing an installation needs every service planned', () => {
  const users = [{ id: 'i1', role: 'installer' }];
  const offerings = [
    { id: 'a1', direction: 'protective', name: 'A1', unit: 'sqft', pricePerSqft: 14 },
    { id: 'a3', direction: 'protective', name: 'A3', unit: 'sqft', pricePerSqft: 22 },
  ];
  const plan = (id: string) => ({ id, installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] });
  const state = (status: string, fields: Row = {}): Row => ({ settings: { serviceOfferings: offerings }, users, orders: [{ id: 'o', status, serviceType: 'protective_film', offeringIds: ['a1', 'a3'], offeringUnits: { a1: 'sqft', a3: 'sqft' }, measurements: { rooms: [{ windows: [{ id: 'w', offeringId: 'a1', measureScope: 'protective_film' }] }] }, extraServices: [], ...fields }] });
  const into = state('installation_scheduled', { serviceSchedules: [plan('offering:a1')] });
  assert.equal(prepareServiceSolutions(state('proposal_accepted'), into, false), 'Сначала внесите замер всех услуг проекта.');
  const measuredOnly = state('installation_scheduled', { offeringIds: ['a1'], serviceSchedules: [plan('offering:a1')] });
  assert.equal(prepareServiceSolutions(state('proposal_accepted', { offeringIds: ['a1'] }), measuredOnly, false), null);
  // A service added after scheduling, still unplanned, blocks closing the installation.
  const active = state('installation_in_progress', { offeringIds: ['a1'], extraServices: [{ id: 'z', type: 'washing', qty: 1, price: 10 }], serviceSchedules: [plan('offering:a1')] });
  const closed = structuredClone(active);
  closed.orders[0].status = 'installation_done';
  assert.equal(prepareServiceSolutions(active, closed, false), 'Укажите дату и исполнителей каждой услуги.');
  const plannedActive = structuredClone(active);
  plannedActive.orders[0].serviceSchedules.push(plan('line:z'));
  const plannedClosed = structuredClone(plannedActive);
  plannedClosed.orders[0].status = 'installation_done';
  assert.equal(prepareServiceSolutions(plannedActive, plannedClosed, false), null);
  const status = html.slice(html.indexOf('function changeStatus(orderId, newStatus, by, opts = {}) {'), html.indexOf('function changeStatus(orderId, newStatus, by, opts = {}) {') + 1600);
  assert.match(status, /const closesInstallation = CLOSED_PROJECT_STATUSES\.includes\(newStatus\) && !CLOSED_PROJECT_STATUSES\.includes\(o\.status\);/);
  assert.match(status, /if \(\(entersInstallation \|\| closesInstallation\) && !ensureProjectServicesPlanned\(o\)\) return false;/);
});

test('a finished installation is read-only on the card; deleting a service drops its plan and the crew follows', () => {
  const { c } = load();
  const done = project('installation_done');
  const out = c.renderProjectCardServices(done, { money: true, manage: true });
  assert.doesNotMatch(out, /projectCardSetQty|projectCardSetPrice|projectCardDeleteService|projectCardAddService/);
  const scheduled = project('installation_scheduled');
  scheduled.offeringIds = ['a1', 'zone'];
  scheduled.serviceSchedules = [
    { id: 'offering:a1', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] },
    { id: 'line:s', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] },
    { id: 'line:z', installationAt: '2026-10-12T16:00:00.000Z', installerIds: ['i2'] },
  ];
  scheduled.installerIds = ['i1', 'i2'];
  scheduled.installationAt = '2026-10-12T16:00:00.000Z';
  c.db.orders.push(scheduled);
  c.getOrder = (id: string) => c.db.orders.find((item: Row) => item.id === id);
  c.projectCardDeleteService('o', 'z');
  assert.deepEqual(plain([scheduled.serviceSchedules.map((item: Row) => item.id), scheduled.installerIds, scheduled.installationAt]), [['offering:a1', 'line:s'], ['i1'], '2026-10-14T16:00:00.000Z']);
  // An included service is not deleted on its own.
  c.projectCardDeleteService('o', 's');
  assert.ok(scheduled.serviceSchedules.some((item: Row) => item.id === 'line:s'));
});

test('server: closing an installation is refused while a service waits for measurement', () => {
  const users = [{ id: 'i1', role: 'installer' }];
  const offerings = [{ id: 'a1', direction: 'protective', name: 'A1', unit: 'sqft' }, { id: 'a3', direction: 'protective', name: 'A3', unit: 'sqft' }];
  const plan = { id: 'offering:a1', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] };
  const active: Row = { settings: { serviceOfferings: offerings }, users, orders: [{ id: 'o', status: 'installation_in_progress', serviceType: 'protective_film', offeringIds: ['a1', 'a3'], offeringUnits: { a1: 'sqft', a3: 'sqft' }, measurements: { rooms: [{ windows: [{ id: 'w', offeringId: 'a1', measureScope: 'protective_film' }] }] }, extraServices: [], serviceSchedules: [plan] }] };
  const closed = structuredClone(active);
  closed.orders[0].status = 'installation_done';
  assert.equal(prepareServiceSolutions(active, closed, false), 'Сначала внесите замер всех услуг проекта.');
});

test('deleting a service with a package drops the included service\'s plan and its specialist leaves the crew', () => {
  const { c } = load();
  c.db.settings.serviceOfferings.push({ id: 'kit', direction: 'smart', name: 'Smart kit', unit: 'fixed', pricePerSqft: 500, includes: ['wire'] }, { id: 'wire', direction: 'smart', name: 'Проводка', unit: 'piece', pricePerSqft: 0 });
  const o: Row = { id: 'k', status: 'installation_scheduled', serviceType: 'smart_film', offeringIds: ['kit', 'wire'], offeringUnits: { kit: 'fixed', wire: 'piece' }, measurements: { rooms: [] }, extraServices: [
    { id: 'p', type: 'offering', offeringId: 'kit', unit: 'fixed', qty: 1, unitPrice: 500, price: 500, serviceType: 'smart_film', offeringName: 'Smart kit' },
    { id: 'c', type: 'offering', offeringId: 'wire', includedBy: 'kit', unit: 'piece', qty: 1, unitPrice: 0, price: 0, serviceType: 'smart_film', offeringName: 'Проводка' },
    { id: 'w', type: 'washing', label: 'Мойка', qty: 1, price: 40 },
  ], serviceSchedules: [
    { id: 'line:p', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] },
    { id: 'line:c', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i2'] },
    { id: 'line:w', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i1'] },
  ], installerIds: ['i1', 'i2'], installationAt: '2026-10-14T16:00:00.000Z' };
  c.db.orders.push(o);
  c.getOrder = (id: string) => c.db.orders.find((item: Row) => item.id === id);
  c.projectCardDeleteService('k', 'p');
  assert.deepEqual(plain([o.extraServices.map((line: Row) => line.id), o.serviceSchedules.map((item: Row) => item.id), o.installerIds, o.installationAt]), [['w'], ['line:w'], ['i1'], '2026-10-16T16:00:00.000Z']);
});

test('server: a project planned as a whole counts as planned; its first per-service plan keeps every service; any close is checked', () => {
  const users = [{ id: 'i1', role: 'installer' }, { id: 'i2', role: 'installer' }];
  const legacy = (status: string, fields: Row = {}): Row => ({ settings: { serviceOfferings: [] }, users, orders: [{ id: 'o', status, serviceType: 'smart_film', measurements: { rooms: [] }, extraServices: [{ id: 'z', type: 'washing', qty: 1, price: 10 }, { id: 'y', type: 'washing', qty: 1, price: 10 }], installerIds: ['i1'], installationAt: '2026-10-15T16:00:00.000Z', ...fields }] });
  // The first per-service plan of a scheduled project must keep every service planned.
  const partialFirst = legacy('installation_scheduled', { serviceSchedules: [{ id: 'line:z', installationAt: '', installerIds: ['i2'] }] });
  assert.equal(prepareServiceSolutions(legacy('installation_scheduled'), partialFirst, false), 'Монтаж назначен: у услуги должны остаться исполнитель и дата.');
  const fullFirst = legacy('installation_scheduled', { serviceSchedules: [{ id: 'line:z', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i2'] }, { id: 'line:y', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] }] });
  assert.equal(prepareServiceSolutions(legacy('installation_scheduled'), fullFirst, false), null);
  // A project planned as a whole can be closed (a field specialist finishing an older job).
  assert.equal(prepareServiceSolutions(legacy('installation_in_progress'), legacy('installation_done'), false), null);
  // Closing straight from «КП принято» is checked like any close.
  const unplanned = (status: string) => legacy(status, { installerIds: [], installationAt: undefined });
  assert.equal(prepareServiceSolutions(unplanned('proposal_accepted'), unplanned('installation_done'), false), 'Укажите дату и исполнителей каждой услуги.');
  // A historical quick project: each line has its specialists and start day.
  const quick = (status: string): Row => ({ settings: { serviceOfferings: [{ id: 'a1', direction: 'protective', name: 'A1', unit: 'sqft' }] }, users, orders: [{ id: 'q', status, serviceType: 'protective_film', offeringIds: ['a1'], offeringUnits: { a1: 'sqft' }, measurements: { rooms: [] }, extraServices: [{ id: 'k', quickProjectLine: true, offeringId: 'a1', unit: 'sqft', qty: 10, price: 100, serviceType: 'protective_film', installerIds: ['i1'], startDate: '2026-09-01' }] }] });
  assert.equal(prepareServiceSolutions(quick('new'), quick('completed'), false), null, 'a quick line carries its service — not waiting for a measurement');
});

test('every way into installation refreshes the film purchase deadline; a historical close writes its per-service plan', () => {
  const status = html.slice(html.indexOf('function changeStatus(orderId, newStatus, by, opts = {}) {'), html.indexOf('function changeStatus(orderId, newStatus, by, opts = {}) {') + 2400);
  assert.match(status, /o\.status = newStatus;\n  if \(entersInstallation\) refreshManualFilmNeededBy\(o\);/);
  const close = html.slice(html.indexOf('function closeQuickProjectAsCompleted('), html.indexOf('function closeQuickProjectAsCompleted(') + 4000);
  assert.match(close, /if \(!o\.serviceSchedules\?\.length\) o\.serviceSchedules = projectPlannedSchedules\(o\);\n  o\.status = 'completed';/);
  const { c } = load();
  const draft: Row = { id: 'd', status: 'proposal_accepted', serviceType: 'protective_film', offeringIds: ['a1'], offeringUnits: { a1: 'sqft' }, measurements: { rooms: [] }, extraServices: [{ id: 'k', quickProjectLine: true, offeringId: 'a1', unit: 'sqft', qty: 10, price: 100, serviceType: 'protective_film' }] };
  assert.deepEqual(plain(c.projectPendingSizedServices(draft)), [], 'before measurement a quick line carries its service');
});

