import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { ROLE_CODES } from '@/lib/auth/constants';
import { mergeFieldWorkspace } from './field-workspace';
import { prepareServiceSolutions } from './service-solutions';

// Owner, 2026-10-10: each service of a project is done on its own day by its
// own crew. A service is planned, in progress or done; its specialist marks
// their own service, and the project becomes «Монтаж выполнен» once every
// service is done.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

function load(user: Row) {
  const services = [
    { id: 'protective_film', catalogCategory: 'protective', title: 'Защитная' },
    { id: 'smart_film', catalogCategory: 'smart', title: 'Смарт' },
  ];
  const db: Row = {
    settings: {
      complexityCoefs: { standard: 1 }, installerRates: { workTypes: {} }, catalog: [],
      serviceOfferings: [
        { id: 'a1', direction: 'protective', name: 'A1 8 mil', unit: 'sqft', pricePerSqft: 14, installerRatePerSqft: 3 },
        { id: 'zone', direction: 'smart', name: 'Подключение зоны', unit: 'zone', pricePerSqft: 100, installerRatePerSqft: 50 },
      ],
    },
    users: [{ id: 'i1', name: 'Алан', role: 'installer' }, { id: 'i2', name: 'Рустам', role: 'installer' }, { id: 'm1', name: 'Данил', role: 'manager' }],
    orders: [] as Row[],
  };
  const calls: string[] = [];
  const manager = user.role !== 'installer';
  const context: any = vm.createContext({
    db, console, state: { currentUserId: user.id },
    ORDER_PRIMARY_SERVICES: services,
    primaryServiceInfo: (id: string) => services.find(item => item.id === id),
    canonicalCatalogCategory: (value: string) => value,
    currentUser: () => user,
    getUser: (id: string) => db.users.find((item: Row) => item.id === id),
    usersByRole: (role: string) => db.users.filter((item: Row) => item.role === role),
    getCatalogItem: () => undefined, windowCatalog: () => undefined,
    windowActualAreaSqft: (win: Row) => Number(win.sqft) || 0,
    warehouseCatalogCostPerSqft: () => 0, filmRate: () => 2.5, installerServiceRateByCategory: () => 2.5,
    measureAllWindows: (o: Row) => (o.measurements?.rooms || []).flatMap((room: Row) => (room.windows || []).map((win: Row) => ({ room, win }))),
    projectQuickLines: (o: Row) => (o.extraServices || []).filter((line: Row) => line.quickProjectLine),
    orderUserCanSeeMoney: () => manager, orderUserCanManage: () => manager,
    orderRevenue: () => 0,
    fmtMoney: (value: number) => `$${Number(value).toFixed(2)}`,
    fmtDate: (value: string) => String(value).slice(0, 10),
    fmtDateTime: (value: string) => String(value).slice(0, 16),
    datetimeLocalValue: (value: string) => String(value).slice(0, 16),
    projectQuickDateValue: (value: string) => value,
    jsQuote: (value: unknown) => String(value ?? ''),
    academyEsc: (value: unknown) => String(value ?? ''),
    renderOrderActionCard: (card: Row) => `<card ${card.title}>`,
    offeringServiceType: (offering: Row) => ({ protective: 'protective_film', smart: 'smart_film' } as Row)[offering?.direction] || '',
    changeStatus: (id: string, status: string) => { calls.push(`status:${status}`); db.orders.find((item: Row) => item.id === id).status = status; return true; },
    save: () => calls.push('save'), render: () => undefined, preservePositionForNextRender: () => undefined,
    alert: (message: string) => calls.push(`alert:${message}`),
    refreshManualFilmNeededBy: () => undefined,
  });
  const start = html.indexOf('// ---------- УСЛУГИ ВНУТРИ НАПРАВЛЕНИЙ');
  vm.runInContext(html.slice(start, html.indexOf('function projectQuickLineCatalog(', start)), context);
  vm.runInContext(html.slice(html.indexOf('function windowRetailPrice('), html.indexOf('function orderInstallerPayout(o)')), context);
  vm.runInContext(html.slice(html.indexOf('function installerAdditionalWorkRate('), html.indexOf('function orderAdditionalWorkPayoutForUser(')), context);
  context.getOrder = (id: string) => db.orders.find((item: Row) => item.id === id);
  return { c: context, db, calls };
}

function project(status = 'installation_scheduled'): Row {
  return {
    id: 'o', status, serviceType: 'protective_film', offeringIds: ['a1', 'zone'], offeringUnits: { a1: 'sqft', zone: 'zone' },
    measurements: { rooms: [{ id: 'r', windows: [{ id: 'w1', sqft: 30, offeringId: 'a1', offeringName: 'A1 8 mil', pricePerSqft: 14, measureScope: 'protective_film' }] }] },
    extraServices: [{ id: 'z', type: 'offering', offeringId: 'zone', unit: 'zone', qty: 3, unitPrice: 100, price: 300, serviceType: 'smart_film', offeringName: 'Подключение зоны' }],
    serviceSchedules: [
      { id: 'offering:a1', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] },
      { id: 'line:z', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i2'] },
    ],
    installerIds: ['i1', 'i2'], installationAt: '2026-10-14T16:00:00.000Z',
  };
}

test('a specialist marks their own service; the project follows its services', () => {
  const { c, db, calls } = load({ id: 'i1', role: 'installer' });
  const o = project();
  db.orders.push(o);
  const [film, zone] = c.projectLines(o);
  assert.equal(c.projectCanMarkService(o, film), true);
  assert.equal(c.projectCanMarkService(o, zone), false, 'another crew\'s service');
  c.projectSetServiceProgress('o', 'line:z', 'done');
  assert.ok(!o.serviceProgress, 'another crew\'s service is not marked');
  c.projectSetServiceProgress('o', 'offering:a1', 'in_progress');
  assert.equal(o.serviceProgress['offering:a1'].status, 'in_progress');
  assert.ok(calls.includes('status:installation_in_progress'));
  c.projectSetServiceProgress('o', 'offering:a1', 'done');
  assert.equal(o.status, 'installation_in_progress', 'the other service is still open');
  // A specialist cannot reopen a done service.
  c.projectSetServiceProgress('o', 'offering:a1', 'in_progress');
  assert.equal(o.serviceProgress['offering:a1'].status, 'done');
  assert.ok(o.timeline.some((event: Row) => event.key === 'service_done' && event.note === 'A1 8 mil'));
});

test('the project becomes «Монтаж выполнен» once every service is done, dated by the last one', () => {
  const { c, db, calls } = load({ id: 'i2', role: 'installer' });
  const o = project('installation_in_progress');
  o.serviceProgress = { 'offering:a1': { status: 'done', startedAt: '2026-10-01T16:00:00.000Z', doneAt: '2026-10-01T20:00:00.000Z', doneBy: 'i1' } };
  db.orders.push(o);
  c.projectMarkMyServicesDone('o');
  assert.equal(o.serviceProgress['line:z'].status, 'done');
  assert.ok(calls.includes('status:installation_done'));
  assert.equal(o.installationDoneAt, o.serviceProgress['line:z'].doneAt);
});

test('marking my services leaves the others open and says so; a manager can reopen', () => {
  const { c, db, calls } = load({ id: 'i1', role: 'installer' });
  const o = project('installation_in_progress');
  db.orders.push(o);
  c.projectMarkMyServicesDone('o');
  assert.equal(o.serviceProgress['offering:a1'].status, 'done');
  assert.equal(o.serviceProgress['line:z'], undefined);
  assert.ok(calls.some(call => call.startsWith('alert:Ваши услуги отмечены. Остальные делает другая бригада: Подключение зоны')));
  const manager = load({ id: 'm1', role: 'manager' });
  const m = project('installation_in_progress');
  m.serviceProgress = { 'offering:a1': { status: 'done', doneAt: '2026-10-14T20:00:00.000Z' } };
  manager.db.orders.push(m);
  manager.c.projectSetServiceProgress('o', 'offering:a1', 'in_progress');
  assert.equal(m.serviceProgress['offering:a1'].status, 'in_progress');
  assert.ok(manager.c.projectServiceProgressCell(m, manager.c.projectLines(m)[0]).includes('Выполнено'));
});

test('the card shows progress once installation is scheduled; the specialist sees «Мои услуги»', () => {
  const { c } = load({ id: 'm1', role: 'manager' });
  const out = c.renderProjectCardServices(project(), { money: true, manage: true });
  assert.match(out, /<th>Ход работ<\/th>/);
  assert.match(out, /projectSetServiceProgress\('o','offering:a1','in_progress'\)/);
  assert.doesNotMatch(c.renderProjectCardServices(project('proposal_accepted'), { money: true, manage: true }), /Ход работ/, 'before scheduling there is no progress');
  const field = load({ id: 'i2', role: 'installer' });
  const mine = field.c.renderInstallerServiceProgress(project(), { id: 'i2' });
  assert.match(mine, /Мои услуги/);
  assert.match(mine, /Подключение зоны/);
  assert.doesNotMatch(mine, /A1 8 mil/);
  assert.match(html, /\$\{renderInstallerServiceProgress\(o, u\)\}/);
  assert.match(html, /title: 'Мои услуги выполнены'[\s\S]{0,200}onclick: `projectMarkMyServicesDone\('\$\{o\.id\}'\)`/);
});

test('closing an installation by hand finishes the open services; deleted services drop their progress', () => {
  const { c } = load({ id: 'm1', role: 'manager' });
  const o = project('installation_in_progress');
  c.projectFinishOpenServices(o, 'm1');
  assert.deepEqual(plain(Object.values(o.serviceProgress).map((entry: any) => entry.status)), ['done', 'done']);
  const status = html.slice(html.indexOf('function changeStatus(orderId, newStatus, by, opts = {}) {'), html.indexOf('function changeStatus(orderId, newStatus, by, opts = {}) {') + 3000);
  assert.match(status, /\} else projectFinishOpenServices\(o, by \|\| state\.currentUserId\);\n  \}\n  o\.status = newStatus;/);
  o.extraServices = [];
  c.projectPrunePlans(o);
  assert.deepEqual(plain(Object.keys(o.serviceProgress)), ['offering:a1']);
});

test('server: progress is marked after scheduling, closes with the installation and then stays', () => {
  const state = (status: string, progress?: Row): Row => ({ settings: { serviceOfferings: [] }, users: [{ id: 'i1', role: 'installer' }], orders: [{ id: 'o', status, serviceType: 'smart_film', measurements: { rooms: [] }, extraServices: [{ id: 'z', type: 'washing', qty: 1, price: 10 }], serviceSchedules: [{ id: 'line:z', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] }], ...(progress ? { serviceProgress: progress } : {}) }] });
  const done = { 'line:z': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z' } };
  assert.equal(prepareServiceSolutions(state('proposal_accepted'), state('proposal_accepted', done), false), 'Ход работ отмечают после «Монтаж назначен».');
  assert.equal(prepareServiceSolutions(state('installation_scheduled'), state('installation_in_progress', done), false), null);
  assert.equal(prepareServiceSolutions(state('installation_in_progress'), state('installation_done', done), false), null, 'closing with the installation');
  assert.equal(prepareServiceSolutions(state('installation_done', done), state('installation_done', {}), true), 'Проект закрыт: ход работ не меняют.');
  assert.equal(prepareServiceSolutions(state('installation_scheduled'), state('installation_scheduled', { 'line:z': { status: 'finished' } }), false), 'Некорректный ход работ.');
  const stray = state('installation_scheduled', { 'line:z': { status: 'in_progress' }, 'line:gone': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z' } });
  assert.equal(prepareServiceSolutions(state('installation_scheduled'), stray, false), null);
  assert.deepEqual(Object.keys(stray.orders[0].serviceProgress), ['line:z'], 'a service that left the project drops its progress');
});

test('field save: a specialist changes the progress of their own services only, and cannot reopen a done one', () => {
  const current = {
    users: [{ id: 'i1', role: 'installer' }, { id: 'i2', role: 'installer' }],
    clients: [], tasks: [],
    orders: [{ id: 'o', status: 'installation_in_progress', installerIds: ['i1', 'i2'],
      measurements: { rooms: [{ id: 'r', windows: [{ id: 'w1', offeringId: 'a1', measureScope: 'protective_film' }] }] },
      extraServices: [{ id: 'z', label: 'Мойка', qty: 1 }],
      serviceSchedules: [
      { id: 'offering:a1', installationAt: '2026-10-14T16:00:00.000Z', installerIds: ['i1'] },
      { id: 'line:z', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i2'] },
    ], serviceProgress: { 'line:z': { status: 'done', doneAt: '2026-10-16T20:00:00.000Z' } } }],
  };
  const submitted = structuredClone(current);
  submitted.orders[0].serviceProgress = {
    'offering:a1': { status: 'done', doneAt: '2026-10-14T20:00:00.000Z' },
    'line:z': { status: 'in_progress' },
  } as any;
  const merged = mergeFieldWorkspace(current, submitted, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  assert.deepEqual(merged.orders[0].serviceProgress['line:z'], { status: 'done', doneAt: '2026-10-16T20:00:00.000Z' }, 'another crew\'s service is untouched');
  const own = merged.orders[0].serviceProgress['offering:a1'];
  assert.deepEqual([own.status, own.doneBy, own.startedBy], ['done', 'i1', 'i1']);
  assert.ok(Math.abs(Date.parse(own.doneAt) - Date.now()) < 60000, 'the server clock, not the submitted date');
  // A forged author or date is ignored: who and when come from the server.
  const forged = structuredClone(current);
  forged.orders[0].serviceProgress = { 'offering:a1': { status: 'in_progress', startedBy: 'i2', startedAt: '2020-01-01T00:00:00.000Z' } } as any;
  const stamped = mergeFieldWorkspace(current, forged, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  assert.equal(stamped.orders[0].serviceProgress['offering:a1'].startedBy, 'i1');
  assert.notEqual(stamped.orders[0].serviceProgress['offering:a1'].startedAt, '2020-01-01T00:00:00.000Z');
  // Even their own done service stays done.
  const reopen = structuredClone(current);
  reopen.orders[0].serviceProgress = { 'line:z': { status: 'in_progress' } } as any;
  const kept = mergeFieldWorkspace(current, reopen, [ROLE_CODES.INSTALLER], ['i2']) as Row;
  assert.equal(kept.orders[0].serviceProgress['line:z'].status, 'done');
});

test('server: the same progress with its fields in another order is not a change (jsonb reorders keys)', () => {
  const users = [{ id: 'i1', role: 'installer' }];
  const saved: Row = { settings: { serviceOfferings: [] }, users, orders: [{ id: 'o', status: 'installation_done', serviceType: 'smart_film', measurements: { rooms: [] }, extraServices: [{ id: 'z', type: 'washing', qty: 1, price: 10 }], serviceSchedules: [{ id: 'line:z', installerIds: ['i1'], installationAt: '2026-10-15T16:00:00.000Z' }], serviceProgress: { 'line:z': { doneAt: '2026-10-15T20:00:00.000Z', doneBy: 'i1', status: 'done' } } }] };
  const next = structuredClone(saved);
  next.orders[0].serviceProgress = { 'line:z': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z', doneBy: 'i1' } };
  next.orders[0].status = 'act_signed';
  assert.equal(prepareServiceSolutions(saved, next, false), null);
});

test('a specialist\'s old «Завершить монтаж» closes only their services; the project waits for the other crew', () => {
  const { c, db, calls } = load({ id: 'i1', role: 'installer' });
  const changeStatusSource = html.slice(html.indexOf('function changeStatus(orderId, newStatus, by, opts = {}) {'));
  vm.runInContext(changeStatusSource.slice(0, changeStatusSource.indexOf('\n}\n') + 2), c);
  Object.assign(c, {
    ensureOrderWorkflowTransition: () => true, ensureVerifiedMeasurementsForStatus: () => true, ensureProductionReadyForInstallation: () => true,
    invalidateProjectEstimate: () => undefined, notifyStatusChange: () => undefined, autoNotifyClient: () => undefined,
  });
  const o = project('installation_in_progress');
  db.orders.push(o);
  assert.equal(c.changeStatus('o', 'installation_done', 'i1'), false);
  assert.equal(o.status, 'installation_in_progress');
  assert.equal(o.serviceProgress['offering:a1'].status, 'done', 'their own service is done');
  assert.equal(o.serviceProgress['line:z'], undefined, 'the other crew\'s service stays open');
  assert.ok(calls.some(call => call.startsWith('alert:Ваши услуги отмечены. Проект закроется, когда будут выполнены остальные: Подключение зоны')));
});

test('a project closed before progress existed shows its services done', () => {
  const { c } = load({ id: 'm1', role: 'manager' });
  const closed = { ...project('completed'), installationDoneAt: '2026-09-20T20:00:00.000Z' };
  const line = c.projectLines(closed)[0];
  assert.deepEqual(plain(c.projectServiceProgress(closed, line.key)), { status: 'done', doneAt: '2026-09-20T20:00:00.000Z', inferred: true });
  assert.match(c.projectServiceProgressCell(closed, line), /✓ выполнена 2026-09-20/);
  assert.equal(c.projectServiceProgress(project(), line.key).status, 'planned');
});

test('server: an installation under way closes only when every service is done', () => {
  const state = (status: string, progress?: Row): Row => ({ settings: { serviceOfferings: [] }, users: [{ id: 'i1', role: 'installer' }, { id: 'i2', role: 'installer' }], orders: [{ id: 'o', status, serviceType: 'smart_film', measurements: { rooms: [] }, extraServices: [{ id: 'z', type: 'washing', qty: 1, price: 10 }, { id: 'y', type: 'washing', qty: 1, price: 10 }], serviceSchedules: [{ id: 'line:z', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] }, { id: 'line:y', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i2'] }], ...(progress ? { serviceProgress: progress } : {}) }] });
  const one = { 'line:z': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z' } };
  assert.equal(prepareServiceSolutions(state('installation_in_progress', one), state('installation_done', one), false), 'Сначала отметьте выполненными все услуги проекта.');
  const both = { ...one, 'line:y': { status: 'done', doneAt: '2026-10-16T20:00:00.000Z' } };
  assert.equal(prepareServiceSolutions(state('installation_in_progress', one), state('installation_done', both), false), null);
});


test('progress marks stay out of the client portal; a service whose windows were deleted loses its progress', () => {
  const portal = html.slice(html.indexOf('function renderClientPortal('), html.indexOf('function renderClientPortal(') + 12000);
  assert.match(portal, /\(o\.timeline\|\|\[\]\)\.filter\(ev => !PROJECT_INTERNAL_TIMELINE_KEYS\.has\(ev\.key\)\)/);
  const { c } = load({ id: 'm1', role: 'manager' });
  assert.deepEqual(plain(vm.runInContext('[...PROJECT_INTERNAL_TIMELINE_KEYS].sort()', c)), ['service_done', 'service_reopened', 'service_started']);
  const o = project('installation_in_progress');
  o.serviceProgress = { 'offering:a1': { status: 'done', doneAt: '2026-10-14T20:00:00.000Z' }, 'line:z': { status: 'in_progress' } };
  o.measurements.rooms[0].windows = [];
  assert.equal(c.syncProjectIncludedServices(o), true);
  assert.deepEqual(Object.keys(o.serviceProgress), ['line:z']);
  // The server drops it too, even when the submitted progress itself did not change.
  const users = [{ id: 'i1', role: 'installer' }];
  const saved: Row = { settings: { serviceOfferings: [] }, users, orders: [{ id: 'o', status: 'installation_in_progress', serviceType: 'smart_film', measurements: { rooms: [{ windows: [{ id: 'w', measureScope: 'smart_film' }] }] }, extraServices: [], serviceSchedules: [{ id: 'direction:smart_film', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] }], serviceProgress: { 'direction:smart_film': { status: 'in_progress', startedAt: '2026-10-15T16:00:00.000Z' } } }] };
  const next = structuredClone(saved);
  next.orders[0].measurements.rooms[0].windows = [];
  assert.equal(prepareServiceSolutions(saved, next, false), null);
  assert.deepEqual(next.orders[0].serviceProgress, {});
  // A done service is not removed from an open project — unless it is reopened first (in the same save too).
  const doneSaved = structuredClone(saved);
  doneSaved.orders[0].serviceProgress = { 'direction:smart_film': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z' } };
  const removing = structuredClone(doneSaved);
  removing.orders[0].measurements.rooms[0].windows = [];
  assert.equal(prepareServiceSolutions(doneSaved, structuredClone(removing), false), 'Услуга выполнена: её не удаляют. Сначала верните её в работу.');
  removing.orders[0].timeline = [{ at: '2026-10-16T09:00:00.000Z', key: 'service_reopened', serviceId: 'direction:smart_film', by: 'm1' }];
  assert.equal(prepareServiceSolutions(doneSaved, removing, false), null);
});

test('when two crews finish at once, the merged save closes the project; its film is written off once by the manager', async () => {
  const { c, db } = load({ id: 'm1', role: 'manager' });
  const o = project('installation_in_progress');
  o.serviceProgress = { 'offering:a1': { status: 'done', doneAt: '2026-10-14T20:00:00.000Z' }, 'line:z': { status: 'done', doneAt: '2026-10-16T19:00:00.000Z' } };
  const open = project('installation_in_progress');
  open.id = 'p';
  open.serviceProgress = { 'offering:a1': { status: 'done', doneAt: '2026-10-14T20:00:00.000Z' } };
  db.orders.push(o, open);
  assert.deepEqual(plain(c.projectCloseFinishedProjects()), ['o']);
  assert.deepEqual([o.status, o.installationDoneAt, open.status], ['installation_done', '2026-10-16T19:00:00.000Z', 'installation_in_progress']);
  const persist = html.slice(html.indexOf('async function cloudPersist('), html.indexOf('async function cloudPersistConfirmed('));
  assert.match(persist, /projectYieldTakenFollowUps\(remotePayload\);\n        snapshot = mergeCloudWorkspaceSnapshots/);
  assert.match(persist, /if \(projectCloseFinishedProjects\(\)\.length \+ projectClaimServiceFollowUps\(\)\) snapshot = JSON\.parse\(JSON\.stringify\(db\)\);/);
  assert.match(persist, /cloudStatus\('Сохранено', 'green'\);\n      projectRunClaimedFollowUps\(snapshot\)\.catch\(/);
  // Its notices are owed durably: the manager CRM that claims the mark sends them.
  assert.equal(o.servicesClosedNotice, 'pending');
  assert.equal(open.servicesClosedNotice, undefined);
  assert.match(html, /const claimedFollowUps = projectClaimServiceFollowUps\(\);/);
  // A field specialist's own close is announced the same way, not from their CRM.
  const change = html.slice(html.indexOf('function changeStatus('), html.indexOf('function acceptMeasurementTask('));
  assert.match(change, /if \(!\(closesInstallation && !orderUserCanManage\(currentUser\(\)\)\)\) \{\n    notifyStatusChange\(o\);/);
});

test('a project closed through its services: one manager CRM claims its write-off and notices, runs them once the claim is saved', async () => {
  const { c, db } = load({ id: 'm1', role: 'manager' });
  let deducted = 0;
  const sent: string[] = [];
  c.autoDeductInventoryForOrder = (order: Row) => { deducted += 1; order._inventoryDeducted = true; };
  c.notifyStatusChange = (order: Row) => sent.push(`staff:${order.id}`);
  let mailDown = true;
  c.autoNotifyClient = async (order: Row) => {
    if (order.id === 'taken2' && mailDown) throw new Error('mail down');
    sent.push(`client:${order.id}`);
  };
  db.inventory = [{ id: 'roll' }];
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  // Closed by a manager's own «Монтаж выполнен»: it wrote off and announced itself, nothing is owed.
  const crews: Row = { ...project('installation_done'), id: 'crews', serviceProgress: { 'line:z': { status: 'done' } } };
  const server: Row = { ...project('installation_done'), id: 'server', serviceProgress: { 'line:z': { status: 'done' } }, servicesClosedNotice: 'pending' };
  const taken: Row = { ...project('installation_done'), id: 'taken', serviceProgress: { 'line:z': { status: 'done' } }, servicesClosedNotice: 'pending' };
  // A claim whose CRM never finished (the tab closed) is taken over after the lease…
  const stale: Row = { ...project('installation_done'), id: 'stale', serviceProgress: { 'line:z': { status: 'done' } }, servicesFollowUpClaim: { token: 'gone', at: '2026-10-20T11:00:00.000Z', notify: true, deduct: true } };
  // …but not while another CRM may still be running it, nor once done.
  const fresh: Row = { ...project('installation_done'), id: 'fresh', serviceProgress: { 'line:z': { status: 'done' } }, servicesFollowUpClaim: { token: 'busy', at: '2026-10-20T11:58:00.000Z', notify: true, deduct: true } };
  const finished: Row = { ...project('installation_done'), id: 'finished', serviceProgress: { 'line:z': { status: 'done' } }, servicesFollowUpClaim: { token: 'gone', at: '2026-10-20T11:00:00.000Z', notify: true, deduct: true, doneAt: '2026-10-20T11:00:05.000Z' } };
  db.orders.push(crews, server, taken, stale, fresh, finished);
  // Right before running, each claim is checked on the server (here: as this CRM saved it).
  let serverOrders: () => Row[] = () => plain(db).orders;
  c.projectFetchSavedOrders = async () => serverOrders();
  let clock = now;
  const run = (payload: Row) => c.projectRunClaimedFollowUps(payload, () => clock);
  // Each step counts once the server confirmed its save.
  let confirmed = 0;
  c.projectPersistFollowUps = async () => { confirmed += 1; return true; };
  assert.equal(c.projectClaimServiceFollowUps(now), 3);
  assert.equal(crews.servicesFollowUpClaim, undefined);
  assert.equal(c.projectClaimServiceFollowUps(now), 0, 'claimed once');
  assert.equal(server.servicesClosedNotice, undefined);
  assert.equal(server.servicesFollowUpClaim.notify, true, 'the claim keeps what is owed');
  // Nothing runs before the claim is saved.
  assert.equal(await run({ orders: [] }), 0);
  assert.equal(deducted + sent.length, 0);
  // Another manager's CRM saved its claim on «taken» first: it is theirs. The
  // stale claim this CRM replaced does not count as taken.
  c.projectYieldTakenFollowUps({ orders: [{ id: 'taken', servicesFollowUpClaim: { token: 'other', at: '2026-10-20T12:00:00.000Z', notify: true, deduct: true } }, { id: 'stale', servicesFollowUpClaim: stale.servicesFollowUpClaim && { token: 'gone', at: '2026-10-20T11:00:00.000Z' } }] });
  assert.equal(taken.servicesFollowUpClaim.token, 'other');
  assert.equal(await run(plain(db)), 2);
  assert.equal(confirmed, 4, 'each staff notice and each finished claim (server, stale) confirmed');
  assert.match(html, /async function projectPersistFollowUps\(\) \{\n  save\(\);\n  return ROLANPRO_CLOUD \? cloudPersistConfirmed\(\) : true;/);
  assert.equal(deducted, 2);
  assert.deepEqual(sent, ['staff:server', 'client:server', 'staff:stale', 'client:stale']);
  assert.ok(server.servicesFollowUpClaim.doneAt && stale.servicesFollowUpClaim.doneAt, 'marked done for every later CRM');
  assert.equal(await run(plain(db)), 0, 'run once');
  clock = now + 3600000;
  assert.equal(c.projectClaimServiceFollowUps(now + 3600000), 2, 'later: only the claims other CRMs never finished (fresh, taken)');
  // A notice that fails is not marked done: the claim stays for a retry.
  const failing: Row = { ...project('installation_done'), id: 'taken2', _inventoryDeducted: true, serviceProgress: { 'line:z': { status: 'done' } }, servicesClosedNotice: 'pending' };
  db.orders.push(failing);
  assert.equal(c.projectClaimServiceFollowUps(now + 3600000), 1);
  assert.equal(await run(plain(db)), 2, 'fresh and taken done; the failing one not');
  assert.ok(failing.servicesFollowUpClaim.token && !failing.servicesFollowUpClaim.doneAt);
  clock = now + 3600000 + 11 * 60000;
  assert.equal(c.projectClaimServiceFollowUps(now + 3600000 + 11 * 60000), 1, 'retried after the lease');
  // The retry sends the client notice only: the staff were told the first time.
  mailDown = false;
  sent.length = 0;
  assert.equal(await run(plain(db)), 1);
  assert.deepEqual(sent, ['client:taken2']);
  assert.ok(failing.servicesFollowUpClaim.doneAt);
  // A project that moved on (act signed) before its notices went out still gets them, as «Монтаж выполнен».
  const staff: string[] = [];
  c.notifyStatusChange = (order: Row) => staff.push(`${order.id}:${order.status}`);
  const signed: Row = { ...project('act_signed'), id: 'signed', _inventoryDeducted: true, serviceProgress: { 'line:z': { status: 'done' } }, servicesClosedNotice: 'pending' };
  // Reopened and closed again: the finished claim of the first close does not swallow the new one.
  const again: Row = { ...project('installation_done'), id: 'again', _inventoryDeducted: true, serviceProgress: { 'line:z': { status: 'done' } }, servicesClosedNotice: 'pending', servicesFollowUpClaim: { token: 'old', at: '2026-10-01T00:00:00.000Z', notify: true, doneAt: '2026-10-01T00:00:10.000Z', staffAt: '2026-10-01T00:00:05.000Z' } };
  db.orders.push(signed, again);
  sent.length = 0;
  clock = now + 7200000;
  assert.equal(c.projectClaimServiceFollowUps(now + 7200000), 2);
  assert.equal(again.servicesFollowUpClaim.staffAt, undefined, 'a new close tells the staff again');
  c.projectYieldTakenFollowUps({ orders: [{ id: 'again', servicesFollowUpClaim: { token: 'old', at: '2026-10-01T00:00:00.000Z', doneAt: '2026-10-01T00:00:10.000Z' } }] });
  assert.equal(await run(plain(db)), 2, 'the replaced finished claim is not someone else\'s');
  assert.deepEqual(staff, ['signed:installation_done', 'again:installation_done']);
  assert.deepEqual(sent, ['client:signed', 'client:again']);
  assert.equal(signed.status, 'act_signed');
  // An empty stock does not drop the write-off: it runs and logs the shortage.
  db.inventory = [];
  const empty: Row = { ...project('installation_done'), id: 'empty', serviceProgress: { 'line:z': { status: 'done' } }, servicesClosedNotice: 'pending' };
  db.orders.push(empty);
  const before = deducted;
  assert.equal(c.projectClaimServiceFollowUps(clock), 1);
  assert.equal(empty.servicesFollowUpClaim.deduct, true);
  assert.equal(await run(plain(db)), 1);
  assert.equal(deducted, before + 1);
  // A tab that slept past its lease, or whose claim another CRM took over, runs nothing.
  const late: Row = { ...project('installation_done'), id: 'late', _inventoryDeducted: true, serviceProgress: { 'line:z': { status: 'done' } }, servicesClosedNotice: 'pending' };
  const over: Row = { ...project('installation_done'), id: 'over', _inventoryDeducted: true, serviceProgress: { 'line:z': { status: 'done' } }, servicesClosedNotice: 'pending' };
  db.orders.push(late, over);
  assert.equal(c.projectClaimServiceFollowUps(clock), 2);
  const savedClaims = plain(db);
  serverOrders = () => savedClaims.orders.map((order: Row) => order.id === 'over' ? { ...order, servicesFollowUpClaim: { token: 'other', at: new Date(clock).toISOString() } } : order);
  clock += 10 * 60000;
  sent.length = 0;
  assert.equal(await run(savedClaims), 0);
  assert.deepEqual(sent, []);
});

test('a manager removes the last open service of a running installation: the project closes', () => {
  const { c, db } = load({ id: 'm1', role: 'manager' });
  const o = project('installation_in_progress');
  o.serviceProgress = { 'offering:a1': { status: 'done', doneAt: '2026-10-14T20:00:00.000Z' } };
  db.orders.push(o);
  const synced: string[] = [];
  c.projectSyncStatusFromServices = (order: Row) => synced.push(order.id);
  c.projectSettleChangedServices(false);
  c.projectSettleChangedServices();
  assert.deepEqual(synced, [], 'no change, nothing to settle');
  o.extraServices = [];
  c.projectSettleChangedServices(false);
  assert.deepEqual(synced, [], 'a change from another CRM is only noted');
  o.extraServices = [{ id: 'k', label: 'Мойка', qty: 1 }];
  c.projectSettleChangedServices();
  assert.deepEqual(synced, ['o']);
  assert.match(html, /cloudScheduleSave\(\);\n    setTimeout\(\(\) => projectSettleChangedServices\(\), 0\);/);
});

test('field save: a started service cannot be taken back; closing takes the date from the services', () => {
  const current = {
    users: [{ id: 'i1', role: 'installer' }], clients: [], tasks: [],
    orders: [{ id: 'o', status: 'installation_in_progress', installerIds: ['i1'], extraServices: [{ id: 'z', label: 'Мойка', qty: 1 }], serviceSchedules: [
      { id: 'line:z', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i1'] },
    ], serviceProgress: { 'line:z': { status: 'in_progress', startedAt: '2026-10-16T16:05:00.000Z', startedBy: 'i1' } } }],
  };
  const erased = structuredClone(current);
  erased.orders[0].serviceProgress = {} as any;
  const kept = mergeFieldWorkspace(current, erased, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  assert.deepEqual(kept.orders[0].serviceProgress['line:z'], current.orders[0].serviceProgress['line:z']);
  // Closing: the submitted date is ignored; the last service's stamp wins.
  const closing = structuredClone(current);
  closing.orders[0].status = 'installation_done';
  (closing.orders[0] as Row).installationDoneAt = '2020-01-01T00:00:00.000Z';
  closing.orders[0].serviceProgress = { 'line:z': { status: 'done' } } as any;
  const closed = mergeFieldWorkspace(current, closing, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  assert.equal(closed.orders[0].status, 'installation_done');
  assert.equal(closed.orders[0].servicesClosedNotice, 'pending', 'a field close is announced by the manager CRM');
  assert.equal(closed.orders[0].installationDoneAt, closed.orders[0].serviceProgress['line:z'].doneAt);
  assert.notEqual(closed.orders[0].installationDoneAt, '2020-01-01T00:00:00.000Z');
});

test('field save: the last service done closes the project on the server; the history of marks is the server\'s', () => {
  const current: Row = {
    settings: { serviceOfferings: [] },
    users: [{ id: 'i1', role: 'installer' }, { id: 'i2', role: 'installer' }], clients: [], tasks: [],
    orders: [{ id: 'o', status: 'installation_in_progress', serviceType: 'smart_film', measurements: { rooms: [] }, installerIds: ['i1', 'i2'],
      extraServices: [{ id: 'z', label: 'Мойка стёкол', qty: 1 }, { id: 'y', label: 'Демонтаж', qty: 1 }],
      serviceSchedules: [
        { id: 'line:z', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i1'] },
        { id: 'line:y', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i2'] },
      ],
      serviceProgress: { 'line:y': { status: 'done', doneAt: '2026-10-01T18:00:00.000Z', doneBy: 'i2' } },
      timeline: [{ at: '2026-10-01T18:00:00.000Z', key: 'service_done', by: 'i2', note: 'Демонтаж' }] }],
  };
  // The browser marks the last service but its «Монтаж выполнен» never came,
  // and it sends a made-up mark of its own.
  const submitted = structuredClone(current);
  submitted.orders[0].serviceProgress['line:z'] = { status: 'done' };
  submitted.orders[0].timeline = [{ at: '2020-01-01T00:00:00.000Z', key: 'service_done', by: 'i2', note: 'Подделка' }];
  const merged = mergeFieldWorkspace(current, submitted, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  const order = merged.orders[0];
  assert.equal(order.status, 'installation_done');
  assert.equal(order.servicesClosedNotice, 'pending', 'its notices go out from the manager\'s CRM');
  assert.equal(order.installationDoneAt, order.serviceProgress['line:z'].doneAt);
  assert.deepEqual(order.timeline.map((event: Row) => [event.key, event.by, event.note]), [
    ['service_done', 'i2', 'Демонтаж'],
    ['service_done', 'i1', 'Мойка стёкол'],
    ['installation_done', 'i1', 'Все услуги выполнены'],
  ]);
  assert.equal(prepareServiceSolutions(current, merged, false), null, 'the closed project passes the closing checks');
  // A browser that did not see it close cannot reopen it.
  const stale = structuredClone(submitted);
  const reopened = mergeFieldWorkspace(merged, stale, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  assert.equal(reopened.orders[0].status, 'installation_done');
  assert.equal(reopened.orders[0].timeline.filter((event: Row) => event.key === 'service_done').length, 2);
  assert.equal(reopened.orders[0].timeline.filter((event: Row) => event.key === 'installation_done').length, 1, 'the server\'s step stays in the history');
  // A service begun starts a planned installation.
  const planned = structuredClone(current);
  planned.orders[0].status = 'installation_scheduled';
  planned.orders[0].serviceProgress = {};
  const starting = structuredClone(planned);
  starting.orders[0].serviceProgress = { 'line:z': { status: 'in_progress' }, 'line:not-real': { status: 'done' } };
  const started = mergeFieldWorkspace(planned, starting, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  assert.equal(started.orders[0].status, 'installation_in_progress');
  assert.ok(!('line:not-real' in started.orders[0].serviceProgress), 'only the project\'s own services are marked');
  assert.deepEqual(started.orders[0].timeline.slice(-2).map((event: Row) => [event.key, event.by]), [['service_started', 'i1'], ['installation_in_progress', 'i1']]);
  assert.equal(prepareServiceSolutions(planned, started, false), null);
  // Progress of a service that left the project does not date the close.
  const orphan = structuredClone(current);
  orphan.orders[0].serviceProgress['line:gone'] = { status: 'done', doneAt: '2099-01-01T00:00:00.000Z' };
  const closing = structuredClone(orphan);
  closing.orders[0].serviceProgress['line:z'] = { status: 'done' };
  const dated = mergeFieldWorkspace(orphan, closing, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  assert.equal(dated.orders[0].status, 'installation_done');
  assert.notEqual(dated.orders[0].installationDoneAt, '2099-01-01T00:00:00.000Z');
  assert.equal(dated.orders[0].installationDoneAt, dated.orders[0].serviceProgress['line:z'].doneAt);
  // A browser cannot take a started installation back to «scheduled».
  const back = structuredClone(started);
  back.orders[0].status = 'installation_scheduled';
  const kept = mergeFieldWorkspace(started, back, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  assert.equal(kept.orders[0].status, 'installation_in_progress');
  assert.equal(kept.orders[0].timeline.filter((event: Row) => event.key === 'installation_in_progress').length, 1, 'a stale save adds no second start');
});


test('field save preserves unfinished-service measurements while restoring a completed service', () => {
  const current: Row = {
    settings: { serviceOfferings: [] },
    users: [{ id: 'i1', role: 'installer' }], clients: [], tasks: [],
    orders: [{ id: 'o', status: 'installation_in_progress', serviceType: 'protective_film', installerIds: ['i1'],
      measurements: { rooms: [{ id: 'r', windows: [
        { id: 'done', width: 1000, height: 1000, offeringId: 'a1', measureScope: 'protective_film' },
        { id: 'open', width: 1200, height: 1000, offeringId: 'a2', measureScope: 'protective_film' },
      ] }] },
      serviceSchedules: [
        { id: 'offering:a1', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] },
        { id: 'offering:a2', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i1'] },
      ],
      serviceProgress: { 'offering:a1': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z', doneBy: 'i1' } },
    }],
  };
  const submitted = structuredClone(current);
  submitted.orders[0].measurements.rooms[0].windows[0].width = 1500; // stale/forbidden edit to done service
  submitted.orders[0].measurements.rooms[0].windows[1].width = 1800; // legitimate unfinished-service edit
  const merged = mergeFieldWorkspace(current, submitted, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  const windows = merged.orders[0].measurements.rooms[0].windows;
  assert.equal(windows.find((win: Row) => win.id === 'done').width, 1000, 'completed service stays authoritative');
  assert.equal(windows.find((win: Row) => win.id === 'open').width, 1800, 'unfinished service edit survives');
});

test('legacy aggregate crew is frozen once a service is completed', () => {
  const users = [{ id: 'i1', role: 'installer' }, { id: 'i2', role: 'installer' }];
  const saved: Row = { settings: { serviceOfferings: [] }, users, orders: [{
    id: 'o', status: 'installation_in_progress', serviceType: 'smart_film',
    measurements: { rooms: [{ id: 'r', windows: [{ id: 'w', measureScope: 'smart_film' }] }] },
    extraServices: [], installerIds: ['i1'], installationAt: '2026-10-15T16:00:00.000Z',
    serviceProgress: { 'direction:smart_film': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z', doneBy: 'i1' } },
  }] };
  const swapped = structuredClone(saved);
  swapped.orders[0].installerIds = ['i2'];
  assert.equal(
    prepareServiceSolutions(saved, swapped, false),
    'Услуга выполнена: её исполнителя и дату не меняют. Сначала верните её в работу.',
  );
});

test('completion follow-up awaits Telegram staff delivery before persisting staffAt', () => {
  assert.match(html, /async function notifyStatusChange\(order\)/);
  assert.match(html, /const delivered = await Promise\.all\(deliveries\);/);
  assert.match(html, /const staffDelivered = await notifyStatusChange\(\{ \.\.\.o, status: 'installation_done' \}\);/);
  assert.match(html, /if \(!staffDelivered\) \{[\s\S]{0,160}continue;[\s\S]{0,220}staffAt:/);
});

test('a done service keeps its specialist and date while the project is open; taking it back is a reopen', () => {
  const { c, db, calls } = load({ id: 'm1', role: 'manager' });
  const o = project('installation_in_progress');
  o.serviceProgress = { 'offering:a1': { status: 'done', doneAt: '2026-10-14T20:00:00.000Z', doneBy: 'i1' }, 'line:z': { status: 'in_progress' } };
  db.orders.push(o);
  // The card refuses to change the done row; the open row still changes.
  c.projectCardToggleCrew('o', 'offering:a1', 'i2', true);
  assert.deepEqual(plain(o.serviceSchedules.find((plan: Row) => plan.id === 'offering:a1').installerIds), ['i1']);
  assert.ok(calls.some(call => call.startsWith('alert:Услуга выполнена')));
  c.projectCardToggleCrew('o', 'line:z', 'i1', true);
  assert.deepEqual(plain(o.serviceSchedules.find((plan: Row) => plan.id === 'line:z').installerIds), ['i2', 'i1']);
  // The schedule window too.
  const moved = plain(o.serviceSchedules).map((plan: Row) => plan.id === 'offering:a1' ? { ...plan, installationAt: '2026-10-20T16:00:00.000Z' } : plan);
  assert.equal(c.projectDoneServicePlanChanged(o, moved), 'A1 8 mil');
  assert.equal(c.projectDoneServicePlanChanged(o, plain(o.serviceSchedules)), '');
  // «Вернуть в работу» on a done service is recorded as a reopen.
  o.timeline = [];
  const line = c.projectLines(o).find((item: Row) => item.key === 'offering:a1');
  c.projectWriteServiceProgress(o, line, 'in_progress', { id: 'm1' });
  assert.equal(o.timeline[0].key, 'service_reopened');
  // The server refuses the change too, and allows it once the service is back in work.
  const users = [{ id: 'i1', role: 'installer' }, { id: 'i2', role: 'installer' }];
  const saved: Row = { settings: { serviceOfferings: [] }, users, orders: [{ id: 'o', status: 'installation_in_progress', serviceType: 'smart_film', measurements: { rooms: [] },
    extraServices: [{ id: 'z', label: 'Мойка', qty: 1 }, { id: 'y', label: 'Демонтаж', qty: 1 }],
    serviceSchedules: [{ id: 'line:z', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] }, { id: 'line:y', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i2'] }],
    serviceProgress: { 'line:z': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z' } } }] };
  const swap = structuredClone(saved);
  swap.orders[0].serviceSchedules[0].installerIds = ['i2'];
  assert.equal(prepareServiceSolutions(saved, swap, false), 'Услуга выполнена: её исполнителя и дату не меняют. Сначала верните её в работу.');
  const open = structuredClone(saved);
  open.orders[0].serviceSchedules[1].installerIds = ['i1'];
  assert.equal(prepareServiceSolutions(saved, open, false), null, 'a service not done yet still changes');
  const reopened = structuredClone(swap);
  reopened.orders[0].serviceProgress = { 'line:z': { status: 'in_progress' } };
  assert.equal(prepareServiceSolutions(saved, reopened, true), null, 'back in work, it changes');
});

test('the CRM does not remove a done service from an open project; reopened, it can', () => {
  const { c, db, calls } = load({ id: 'm1', role: 'manager' });
  const o = project('installation_in_progress');
  o.serviceProgress = { 'line:z': { status: 'done', doneAt: '2026-10-16T20:00:00.000Z' } };
  db.orders.push(o);
  c.projectEstimateMarkChanged = () => undefined;
  c.projectCardDeleteService('o', 'z');
  assert.equal(o.extraServices.length, 1, 'the done row stays');
  assert.ok(calls.some(call => call.startsWith('alert:Подключение зоны: услуга выполнена')));
  o.serviceProgress = { 'line:z': { status: 'in_progress' } };
  c.projectCardDeleteService('o', 'z');
  assert.equal(o.extraServices.length, 0);
  assert.match(html, /function managerDeleteWin\(oid, rid, wid\) \{[\s\S]{0,200}projectKeepsDoneServices\(o,/);
  assert.match(html, /function deleteRoom\(oid, rid\) \{\n  const o = getOrder\(oid\);\n  if \(!projectKeepsDoneServices\(o,/);
  assert.match(html, /function managerDeleteRoom\(oid, rid\) \{[\s\S]{0,300}projectKeepsDoneServices\(o,/);
  assert.match(html, /function deleteExtraService\(oid, sid\) \{\n  const o = getOrder\(oid\);\n  if \(!projectKeepsDoneServices\(o,/);
  assert.match(html, /function projectEstimateDeleteService\(oid, sid\) \{[\s\S]{0,200}projectKeepsDoneServices\(o,/);
});

test('changing the work of a done service sends it back to work; its price may change', () => {
  const { c, db, calls } = load({ id: 'm1', role: 'manager' });
  const o = project('installation_in_progress');
  o.serviceProgress = { 'offering:a1': { status: 'done', doneAt: '2026-10-14T20:00:00.000Z' }, 'line:z': { status: 'in_progress' } };
  o.timeline = [];
  db.orders.push(o);
  c.projectSettleChangedServices(false);
  // A price change keeps it done.
  o.measurements.rooms[0].windows[0].pricePerSqft = 12;
  c.projectSettleChangedServices();
  assert.equal(o.serviceProgress['offering:a1'].status, 'done');
  // Another window of the same service: back in work, with a reopen event and a message.
  o.measurements.rooms[0].windows.push({ id: 'w2', sqft: 10, offeringId: 'a1', measureScope: 'protective_film' });
  c.projectSettleChangedServices();
  assert.equal(o.serviceProgress['offering:a1'].status, 'in_progress');
  assert.equal(o.timeline.at(-1).key, 'service_reopened');
  assert.ok(calls.some(call => call.startsWith('alert:Изменён объём выполненной услуги')));
  // A done service removed by an edit that does not check it: the history records it, so the save goes through.
  o.serviceProgress['line:z'] = { status: 'done', doneAt: '2026-10-16T20:00:00.000Z' };
  c.projectSettleChangedServices(false);
  o.extraServices = [];
  c.projectSettleChangedServices();
  assert.deepEqual([o.timeline.at(-1).key, o.timeline.at(-1).serviceId], ['service_reopened', 'line:z']);
  assert.ok(calls.some(call => call.includes('Выполненная услуга убрана из проекта: Подключение зоны')));
  // The server refuses a changed scope that stays done; the same change reopened passes.
  const users = [{ id: 'i1', role: 'installer' }];
  const saved: Row = { settings: { serviceOfferings: [] }, users, orders: [{ id: 'o', status: 'installation_in_progress', serviceType: 'smart_film', measurements: { rooms: [] },
    extraServices: [{ id: 'z', label: 'Мойка', qty: 1, price: 10 }, { id: 'y', label: 'Демонтаж', qty: 1 }],
    serviceSchedules: [{ id: 'line:z', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] }, { id: 'line:y', installationAt: '2026-10-16T16:00:00.000Z', installerIds: ['i1'] }],
    serviceProgress: { 'line:z': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z' } } }] };
  const more = structuredClone(saved);
  more.orders[0].extraServices[0].qty = 3;
  assert.equal(prepareServiceSolutions(saved, structuredClone(more), true), 'Услуга выполнена: её объём не меняют. Сначала верните её в работу.');
  more.orders[0].serviceProgress = { 'line:z': { status: 'in_progress' } };
  assert.equal(prepareServiceSolutions(saved, more, true), null);
  const repriced = structuredClone(saved);
  repriced.orders[0].extraServices[0].price = 15;
  assert.equal(prepareServiceSolutions(saved, repriced, true), null, 'a price is not the work');
  // A field save cannot change a done service's windows: the saved measurements stay, the mark stays done.
  const field: Row = { users, clients: [], tasks: [], orders: [{ id: 'o', status: 'installation_in_progress', serviceType: 'protective_film', measurerId: 'i1', installerIds: ['i1'],
    measurements: { rooms: [{ id: 'r', windows: [{ id: 'w1', width: 1000, height: 1000, offeringId: 'a1', measureScope: 'protective_film' }] }] },
    serviceSchedules: [{ id: 'offering:a1', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] }],
    serviceProgress: { 'offering:a1': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z', startedBy: 'i1' } } }] };
  const resized = structuredClone(field);
  resized.orders[0].measurements.rooms[0].windows[0].width = 1500;
  const merged = mergeFieldWorkspace(field, resized, [ROLE_CODES.INSTALLER], ['i1']) as Row;
  assert.equal(merged.orders[0].serviceProgress['offering:a1'].status, 'done');
  assert.equal(merged.orders[0].measurements.rooms[0].windows[0].width, 1000);
  assert.equal(prepareServiceSolutions({ ...field, settings: { serviceOfferings: [] } }, { ...merged, settings: { serviceOfferings: [] } }, false), null);
});
