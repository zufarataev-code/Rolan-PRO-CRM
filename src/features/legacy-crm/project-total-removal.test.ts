import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-11-13:
//  • «снятие плёнки почему-то определилось как солнцезащитная… это услуга
//    универсальная, спутник всех направлений» + «цена за sq ft и общая»;
//  • «внизу должно быть общее поле — сумма, и её можно поменять»;
//  • «заполняю данные — происходит обновление, и данные удаляются».
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };
type Row = Record<string, any>;

test('old film removal is a general service priced per sq ft, and a typed rate survives a resize', () => {
  const windows: Row[] = [{ area: 40, removalRequired: true }, { area: 10, removalRequired: true }];
  const ctx: Row = {
    db: { settings: {} },
    measureAllWindows: () => windows.map(win => ({ win })),
    windowRemovalRequired: (win: Row) => win.removalRequired,
    windowActualAreaSqft: (win: Row) => win.area,
  };
  vm.createContext(ctx);
  vm.runInContext(['orderRemovalAreaSqft', 'removalPricePerSqft', 'syncOrderWindowRemovalService'].map(name => fn(html, name)).join(''), ctx);
  const order: Row = { extraServices: [] };
  ctx.order = order;
  vm.runInContext('syncOrderWindowRemovalService(order)', ctx);
  const line = order.extraServices[0];
  assert.deepEqual([line.serviceType, line.unit, line.qty, line.unitPrice, line.price], ['general_works', 'sqft', 50, 2.5, 125]);

  line.unitPrice = 3; // the manager's rate from the «Цена» step
  windows[0].area = 60;
  vm.runInContext('syncOrderWindowRemovalService(order)', ctx);
  assert.deepEqual([line.qty, line.unitPrice, line.price], [70, 3, 210], 'the sum follows the area at the typed rate');

  assert.match(fn(html, 'projectLines'), /direction: line\.serviceType \|\| \(line\.autoWindowRemoval \? 'general_works' : ''\)/, 'rows saved before this change leave «Солнцезащитная» too');
  assert.match(fn(html, 'projectLines'), /unitPriced: kind === 'work' && line\.unit === 'sqft' && Number\(line\.unitPrice\) > 0 && qty > 0/);
});

function loadTotal(role = 'owner') {
  const removal: Row = { id: 'auto_window_removal', autoWindowRemoval: true, qty: 50, unit: 'sqft', unitPrice: 2.5, price: 125 };
  const silicone: Row = { id: 's1', offeringId: 'svc', qty: 10, unitPrice: 5, price: 50 };
  const win: Row = { id: 'w', area: 50, pricePerSqft: 9 };
  const order: Row = { id: 'o', status: 'measurement_done', complexity: 'standard' };
  const offerings: Row = { film: { id: 'film', name: 'Black Silver', pricePerSqft: 9, minPricePerUnit: 8 }, svc: { id: 'svc', name: 'Силикон', pricePerSqft: 5 } };
  const alerts: string[] = [];
  const ctx: Row = {
    db: { settings: { complexityCoefs: { standard: 1 }, removalPricePerSqft: 2.5 } }, alerts, order, win, removal, silicone,
    CLOSED_PROJECT_STATUSES: ['completed'],
    getOrder: () => order, currentUser: () => ({ role }), orderUserCanSeeMoney: () => true,
    measureAllWindows: () => [{ win }],
    serviceOffering: (id: string) => offerings[id] || null,
    windowActualAreaSqft: (item: Row) => item.area,
    projectLines: () => [
      { key: 'w', kind: 'windows', name: 'Black Silver', offeringId: 'film', qty: 50, price: win.area * win.pricePerSqft, windows: [win], sources: [] },
      { key: 'q', kind: 'quantity', name: 'Силикон', offeringId: 'svc', qty: 10, unitShort: 'lft', price: silicone.price, sources: [silicone] },
      { key: 'r', kind: 'work', unitPriced: true, name: 'Снятие старой плёнки', offeringId: '', qty: 50, unitShort: 'sq ft', price: removal.price, sources: [removal] },
    ],
    fmtMoney: (n: number) => `$${Math.round(n)}`, alert: (m: string) => alerts.push(m), projectEstimateMarkChanged: () => {}, save: () => {},
  };
  ctx.orderRevenue = () => ctx.projectLines().reduce((sum: number, line: Row) => sum + line.price, 0);
  vm.createContext(ctx);
  vm.runInContext(fn(html, 'projectServicePriceRange') + fn(html, 'removalPricePerSqft')
    + ['projectLineUnitPrice', 'projectLineListPrice', 'projectApplyLineUnitPrice', 'projectTotalAdjustableLines', 'projectTotalIsManual', 'projectSetTotal', 'projectResetTotal'].map(name => fn(stages, name)).join(''), ctx);
  return ctx;
}

test('a typed project total moves every priced line by the same share and lands exactly', () => {
  const ctx = loadTotal();
  assert.equal(ctx.orderRevenue(), 625); // 450 + 50 + 125
  assert.equal(vm.runInContext("projectSetTotal('o','1000')", ctx), true);
  assert.ok(Math.abs(ctx.orderRevenue() - 1000) < 0.005, String(ctx.orderRevenue()));
  assert.ok(Math.abs(ctx.win.pricePerSqft / 9 - 1.6) < 0.001 && Math.abs(ctx.removal.unitPrice / 2.5 - 1.6) < 1e-9 && Math.abs(ctx.silicone.unitPrice / 5 - 1.6) < 1e-9, 'one share for all lines');
  assert.equal(ctx.removal.price, 200, 'a counted row keeps price = quantity × rate');
  assert.equal(ctx.order.manualProjectTotal, 1000);
  assert.equal(vm.runInContext('projectTotalIsManual(order)', ctx), true);

  assert.equal(vm.runInContext("projectResetTotal('o')", ctx), true);
  assert.deepEqual([ctx.win.pricePerSqft, ctx.silicone.unitPrice, ctx.removal.unitPrice, ctx.orderRevenue()], [9, 5, 2.5, 625], '«↺ вернуть цены» restores the prices from before the manual total');
  assert.equal(ctx.order.manualProjectTotal, undefined);
  assert.equal(ctx.order.manualProjectTotalBase, undefined);
});

test('the reset restores custom work and hand-typed prices too, not only directory prices', () => {
  const ctx = loadTotal();
  const custom: Row = { id: 'c1', price: 300 };
  const lines = ctx.projectLines();
  ctx.win.pricePerSqft = 11; // typed by hand before the total: not the $9 list price
  ctx.projectLines = () => [
    { key: 'w', kind: 'windows', name: 'Black Silver', offeringId: 'film', qty: 50, price: ctx.win.area * ctx.win.pricePerSqft, windows: [ctx.win], sources: [] },
    { key: 'c', kind: 'work', name: 'Подрядчик', offeringId: '', qty: 1, price: custom.price, sources: [custom] },
  ];
  assert.equal(lines.length, 3);
  assert.equal(ctx.orderRevenue(), 850);
  vm.runInContext("projectSetTotal('o','1000')", ctx);
  vm.runInContext("projectSetTotal('o','1200')", ctx); // a second total keeps the first snapshot
  assert.ok(Math.abs(ctx.orderRevenue() - 1200) < 0.005);
  vm.runInContext("projectResetTotal('o')", ctx);
  assert.deepEqual([ctx.win.pricePerSqft, custom.price, ctx.orderRevenue()], [11, 300, 850]);
});

test('a quick-entry project can be repriced by its total; quick rows of a measured project stay out', () => {
  const ctx = loadTotal();
  const quick: Row = { id: 'q1', quickProjectLine: true, qty: 40, unit: 'sqft', unitPrice: 10, price: 400 };
  ctx.projectLines = () => [{ key: 'k', kind: 'quick', name: 'Solar', offeringId: '', qty: 40, price: quick.price, sources: [quick] }];
  ctx.measureAllWindows = () => [];
  assert.equal(vm.runInContext("projectSetTotal('o','500')", ctx), true);
  assert.deepEqual([quick.price, quick.unitPrice], [500, 12.5]);

  ctx.measureAllWindows = () => [{ win: ctx.win }];
  assert.equal(vm.runInContext('projectTotalAdjustableLines(order).length', ctx), 0, 'measured windows carry the revenue then');
});

test('the price corridor binds a manager\'s total but not the owner\'s; a closed project is not repriced', () => {
  const manager = loadTotal('manager');
  assert.equal(vm.runInContext("projectSetTotal('o','500')", manager), false, '$7.20 / sq ft is under the $8 minimum');
  assert.match(manager.alerts[0], /за рамки прайса/);
  assert.equal(manager.orderRevenue(), 625, 'nothing changed');

  const owner = loadTotal('owner');
  assert.equal(vm.runInContext("projectSetTotal('o','500')", owner), true);
  assert.ok(Math.abs(owner.orderRevenue() - 500) < 0.005);

  owner.order.status = 'completed';
  assert.equal(vm.runInContext("projectSetTotal('o','900')", owner), false);
});

test('the card footer carries the editable total; lines show the rate their sum is made of', () => {
  const card = fn(stages, 'renderProjectCardServices');
  assert.match(card, /edit && lines\.length \? projectTotalEditHtml\(o\)/, 'read-only roles and closed projects keep the plain total');
  assert.match(fn(stages, 'projectTotalEditHtml'), /aria-label="Итог проекта"[^>]*onchange="projectCardSetTotal\('\$\{o\.id\}',this\.value\)"/);
  assert.match(card, /projectLineRateText\(o, line\)/);
  assert.match(fn(stages, 'projectLineRateText'), /fmtSqftPrice\(projectLineUnitPrice\(o, line\)\)/, 'cents are shown: $2.50, not $3');
});

function loadBackground() {
  const fields: Row[] = [];
  let renders = 0;
  const timers: Array<() => void> = [];
  const ctx: Row = {
    document: { activeElement: null, querySelectorAll: () => fields },
    Date, Array,
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; },
    clearTimeout: () => undefined,
    preservePositionForNextRender: () => undefined,
    render: () => { renders += 1; },
  };
  vm.createContext(ctx);
  vm.runInContext('let __lastFieldInputAt = 0; let __backgroundRenderTimer = null;' + ['formUnsavedFieldCount', 'userIsEnteringData', 'renderBackground'].map(name => fn(html, name)).join('')
    + 'function typed() { __lastFieldInputAt = Date.now(); }', ctx);
  return { ctx, fields, timers, renders: () => renders };
}

test('a background redraw waits while typed data is not saved yet, then runs', () => {
  const { ctx, fields, timers, renders } = loadBackground();
  vm.runInContext('renderBackground()', ctx);
  assert.equal(renders(), 1, 'nothing typed — the screen refreshes at once');

  const size: Row = { tagName: 'INPUT', type: 'number', value: '48', defaultValue: '' };
  fields.push(size, { tagName: 'INPUT', type: 'search', value: 'josh', defaultValue: '' }, { tagName: 'SELECT', options: [{ selected: true, defaultSelected: false }, { selected: false, defaultSelected: false }], selectedIndex: 0 });
  vm.runInContext('typed(); renderBackground()', ctx);
  assert.equal(renders(), 1, 'the typed size is still only on the screen — do not redraw over it');
  assert.equal(timers.length, 1, 'tries again in a moment');
  assert.equal(vm.runInContext('formUnsavedFieldCount()', ctx), 1, 'a search box and an untouched select are not unsaved data');

  size.defaultValue = '48'; // the field was committed and the person's own render drew it
  timers[0]();
  assert.equal(renders(), 2);
});

test('remote data and status polls redraw in the background; a new release does not reload over typed data', () => {
  assert.match(fn(html, 'cloudPullRemoteChanges'), /renderBackground\(\);/);
  assert.match(fn(html, 'refreshEmailChannelStatus'), /renderBackground\(\);/, 'the 5-minute mail poll');
  assert.match(fn(html, 'syncZadarmaCalls'), /if \(changed\) \{ save\(\); renderBackground\(\); \}/);
  assert.match(fn(html, 'syncTwilioMessages'), /else renderBackground\(\);/);
  assert.match(fn(html, 'fetchCanonicalLeads'), /if \(options\.background\) renderBackground\(\); else render\(\);/, 'the «Обновить» button still redraws at once');
  assert.match(fn(html, 'cloudUserIsBusy'), /!!document\.getElementById\('rp-cashier-layer'\) \|\| userIsEnteringData\(\)/, 'the open cashier and unsaved fields hold the reload');
});

// Owner, 2026-11-13: «нужна возможность выбрать исполнителей на весь проект».
test('one crew and one date go to every service still to do; done services keep their history', () => {
  const schedules: Row = { a: { id: 'a', installerIds: [], installationAt: '' }, b: { id: 'b', installerIds: ['old'], installationAt: '2026-11-01T17:00:00.000Z' }, done: { id: 'done', installerIds: ['old'], installationAt: '2026-10-01T17:00:00.000Z' } };
  const order: Row = { id: 'o', status: 'proposal_accepted', timeline: [] };
  const calls: string[] = [];
  const ctx: Row = {
    state: { currentUserId: 'u', _installWindow: { oid: 'o', key: '*', draft: { installerIds: ['i1', 'i2'], installationAt: '2026-11-20T17:00:00.000Z', endsAt: '', note: 'парковка во дворе' } } },
    PROJECT_SCHEDULED_STATUSES: ['installation_scheduled'],
    getOrder: () => order, projectCardCanPlan: () => true, alert: (m: string) => calls.push(`alert:${m}`),
    installWindowRows: () => [{ group: { id: 'a' }, done: false }, { group: { id: 'b' }, done: false }, { group: { id: 'done' }, done: true }],
    projectCardSchedule: (_o: Row, id: string) => schedules[id],
    projectCardKeepsPlan: () => true, projectCardSyncCrew: () => calls.push('sync'),
    projectServiceGroups: () => [], installRangeText: () => 'пт 20 нояб.', installCrewText: (plan: Row) => plan.installerIds.join(', '),
    save: () => calls.push('save'), openInstallWindow: (oid: string) => calls.push(`open:${oid}`),
  };
  vm.createContext(ctx);
  assert.match(stages, /^function installWholeProjectKey\(\) \{ return '\*'; \}$/m);
  vm.runInContext("function installWholeProjectKey() { return '*'; }" + ['installPlanComplete', 'installSaveService'].map(name => fn(stages, name)).join(''), ctx);
  vm.runInContext("installSaveService('o','*')", ctx);
  for (const id of ['a', 'b']) assert.deepEqual([schedules[id].installerIds.join(','), schedules[id].installationAt, schedules[id].endsAt, schedules[id].note], ['i1,i2', '2026-11-20T17:00:00.000Z', '2026-11-21T01:00:00.000Z', 'парковка во дворе']);
  assert.deepEqual(schedules.done.installerIds, ['old'], 'a finished service is not replanned');
  assert.match(order.timeline[0].note, /^Весь проект \(2\): /);
  assert.deepEqual(calls, ['sync', 'save', 'open:o']);

  const view = fn(stages, 'installWindowHtml');
  assert.match(view, /openRows\.length > 1 && projectCardCanPlan\(o\) \? `<button type="button" class="install-row open" data-install-whole/, 'offered only when there is more than one service to plan');
  assert.match(fn(stages, 'installWorkKind'), /if \(\/снят\|удален\|демонтаж\|removal\/\.test\(text\)\) return 'other';/, 'old film removal is not labelled «Монтаж плёнки»');
});
