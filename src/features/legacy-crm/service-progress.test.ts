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
    orders: [{ id: 'o', status: 'installation_in_progress', installerIds: ['i1', 'i2'], serviceSchedules: [
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
  assert.deepEqual(merged.orders[0].serviceProgress, {
    'line:z': { status: 'done', doneAt: '2026-10-16T20:00:00.000Z' },
    'offering:a1': { status: 'done', doneAt: '2026-10-14T20:00:00.000Z' },
  });
  // Even their own done service stays done.
  const own = structuredClone(current);
  own.orders[0].serviceProgress = { 'line:z': { status: 'in_progress' } } as any;
  const kept = mergeFieldWorkspace(current, own, [ROLE_CODES.INSTALLER], ['i2']) as Row;
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
  const saved: Row = { settings: { serviceOfferings: [] }, users, orders: [{ id: 'o', status: 'installation_in_progress', serviceType: 'smart_film', measurements: { rooms: [{ windows: [{ id: 'w', measureScope: 'smart_film' }] }] }, extraServices: [], serviceSchedules: [{ id: 'direction:smart_film', installationAt: '2026-10-15T16:00:00.000Z', installerIds: ['i1'] }], serviceProgress: { 'direction:smart_film': { status: 'done', doneAt: '2026-10-15T20:00:00.000Z' } } }] };
  const next = structuredClone(saved);
  next.orders[0].measurements.rooms[0].windows = [];
  assert.equal(prepareServiceSolutions(saved, next, false), null);
  assert.deepEqual(next.orders[0].serviceProgress, {});
});
