import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-11-03: «панель для быстрого ввода — чтобы менеджер мог внести
// заказ за прошлый месяц: услуга, плёнка, исполнитель, адрес, контакт, откуда
// лид — и сформировать аналитику по услугам, проверить формулы и зарплаты».
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('the panel is a view of its own for owner and manager', () => {
  assert.match(html, /\['quickEntry', 'Выполненные проекты', '⚡'\]/);
  assert.match(html, /case 'quickEntry': return renderQuickEntry\(\);/);
  assert.match(fn(stages, 'quickEntryCanUse'), /\['owner', 'manager'\]\.includes/);
});

test('historical entry first creates one draft project, then opens the canonical multi-service editor', () => {
  const create = fn(stages, 'quickEntryCreateDraft');
  for (const required of ['дата проекта', 'имя клиента', 'менеджер']) assert.ok(create.includes(required), required);
  assert.doesNotMatch(create, /problems\.push\('замерщик'\)/, 'an unknown historical surveyor is allowed');
  assert.match(create, /extraServices: \[\], extraExpenses: \[\]/, 'the header does not invent a first service');
  assert.match(create, /measurerId: f\.measurer \|\| null/);
  assert.match(create, /actor\?\.role === 'owner' \? f\.manager : actor\?\.id/, 'a manager cannot create an inaccessible draft for another manager');
  assert.match(create, /managerId,/);
  assert.match(create, /quickEntryDraft: true/);
  assert.match(create, /openQuickProjectEntry\(o\.id\)/, 'the existing project editor owns services, expenses and closing');
  assert.doesNotMatch(create, /quickEntryComplete\(/, 'creating the header must not close the project automatically');
});

test('rates come only from the directories: the panel reads orderPSS and calcUserPayoutForPeriod', () => {
  const econ = fn(stages, 'quickEntryEconomics');
  assert.match(econ, /const pss = orderPSS\(o\);/);
  assert.doesNotMatch(econ, /commissionPct\s*\*|installerRatePerSqft\s*\*/, 'no formulas of its own');
  assert.match(econ, /монтажникам насчитано \$0/);
  assert.match(econ, /цена ниже коридора/);
  assert.match(fn(stages, 'quickEntryPeople'), /calcUserPayoutForPeriod\(u\.id, start, end\)/);
});

test('the project header reads all facts before creating the draft', () => {
  const read = fn(stages, 'quickEntryReadForm');
  for (const field of ['date', 'manager', 'client', 'phone', 'street', 'city', 'source', 'site', 'measurer', 'notes']) assert.ok(read.includes(`'${field}'`), field);
});

test('owner can be the surveyor without duplicating the employee card', () => {
  assert.match(fn(stages, 'quickEntryMeasurers'), /\['measurer', 'owner'\]\.includes/);
  assert.match(stages, /Замерщик<select id="qe-measurer"/);
});

test('a new historical draft defaults to the current office user instead of the first manager', () => {
  const users = [
    { id: 'first', role: 'manager', active: true },
    { id: 'creator', role: 'manager', active: true },
  ];
  const context: any = vm.createContext({
    db: { users },
    currentUser: () => users[1],
    localDateKey: () => '2026-11-04',
  });
  vm.runInContext(`${fn(stages, 'quickEntryManagers')}; ${fn(stages, 'quickEntryDefaultForm')}; result = quickEntryDefaultForm();`, context);
  assert.equal(context.result.manager, 'creator');
});

test('manager creation UI is locked to the current manager', () => {
  const renderer = fn(stages, 'renderQuickEntry');
  assert.match(renderer, /managerChoices = owner \? managers : managers\.filter\(user => user\.id === currentUser\(\)\?\.id\)/);
  assert.match(renderer, /Менеджер создаёт исторический проект только на себя/);
});

test('canonical editor supports many services with their own dates, crew, supplies and direct expenses', () => {
  const renderer = fn(html, 'renderQuickProjectEntry');
  assert.match(renderer, /Можно добавить несколько услуг/);
  assert.match(renderer, /projectEstimateAddQuickLine/);
  assert.match(renderer, /Начало работ/);
  assert.match(renderer, /projectQuickToggleInstaller/);
  assert.match(renderer, /projectQuickAddSupply/);
  assert.match(renderer, /projectQuickAddExpense/);
  assert.match(renderer, /\['owner', 'manager'\]\.includes\(quickRole\)/, 'owner and manager can fill dates, crew and supplies');
  assert.match(renderer, /canCloseHistoricalProject = quickRole === 'owner'/, 'only the owner confirms money and closes the import');
  assert.match(renderer, /canReassignHistoricalManager = quickRole === 'owner'/, 'only the owner can reassign the project manager');
  assert.match(renderer, /Number\.isFinite\(Number\(o\.paid\)\) \? Math\.max\(0, Number\(o\.paid\)\) : 0/, 'an unpaid import must remain at zero instead of looking fully paid');
  const close = fn(html, 'closeQuickProjectAsCompleted');
  assert.match(close, /o\.status = full \? 'completed' : 'act_signed'/, 'partial payment leaves debt visible');
  assert.match(close, /o\.measurementDoneAt = o\.measurementDoneAt \|\| startAt/, 'a completed import accrues fixed-per-job surveyor payroll');
  assert.match(close, /projectEstimateApprovalSnapshot\(o, recordedAt, true\)/);
});

test('unfinished historical imports stay out of every financial rollup until owner closure', () => {
  const draft = { id: 'draft', quickEntryDraft: true, quickProjectImportedCompleted: false, paid: 0 };
  const closed = { id: 'closed', quickEntryDraft: false, quickProjectImportedCompleted: true, paid: 25 };
  const context: any = vm.createContext({
    db: { orders: [draft, closed] },
    orderPaidTotal: (order: any) => Number(order.paid) || 0,
    orderRevenue: () => 100,
  });
  vm.runInContext(`${fn(html, 'orderIncludedInFinancialReports')}; ${fn(html, 'financialOrders')}; ${fn(html, 'orderDebt')}; result = { ids: financialOrders().map(o => o.id), draftDebt: orderDebt(db.orders[0]), closedDebt: orderDebt(db.orders[1]) };`, context);
  assert.deepEqual(Array.from(context.result.ids), ['closed']);
  assert.equal(context.result.draftDebt, 0);
  assert.equal(context.result.closedDebt, 75);

  assert.match(fn(html, 'renderOwnerPanel'), /const allOrders = financialOrders\(\)/);
  assert.match(fn(html, 'renderAccounting'), /financialOrders\(\)/);
  assert.match(fn(html, 'renderFinanceProjects'), /financialOrders\(\)/);
  assert.match(fn(html, 'renderReports'), /financialOrders\(/);
  assert.match(fn(html, 'buildCashDashboard'), /const reportingOrders = financialOrders\(\)/);
  assert.match(fn(html, 'buildProductPnL'), /financialOrders\(\)\.forEach/);
  assert.match(fn(html, 'buildMarketingRoi'), /financialOrders\(\)\.forEach/);
});

test('a manager cannot reassign a historical project and lose access to it', () => {
  const order = { id: 'o', quickProjectImportedCompleted: false, managerId: 'manager-a' };
  let saved = false;
  const context: any = vm.createContext({
    getOrder: () => order,
    orderUserCanSeeMoney: () => true,
    currentUser: () => ({ id: 'manager-a', role: 'manager' }),
    getUser: () => ({ id: 'manager-b', role: 'manager', active: true }),
    projectEstimateMarkChanged: () => undefined,
    save: () => { saved = true; },
    refreshQuickProjectEntry: () => undefined,
  });
  vm.runInContext(`${fn(html, 'quickProjectUpdateHeader')}; quickProjectUpdateHeader('o', 'managerId', 'manager-b');`, context);
  assert.equal(order.managerId, 'manager-a');
  assert.equal(saved, false);
});

test('historical services are the only source of their directions and a closed import is immutable', () => {
  const sync = fn(html, 'projectEstimateSyncQuickServices');
  assert.match(sync, /const leadService = o\.quickEntry \? '' : orderLeadIntentServiceId\(o\)/);
  assert.match(sync, /\[leadService, \.\.\.measuredServices, \.\.\.quickServices\]/);
  assert.match(fn(html, 'quickProjectUpdateHeader'), /o\.quickProjectImportedCompleted/);
});

test('unfinished historical drafts stay reachable regardless of age', () => {
  const db = {
    orders: [
      { id: 'old', quickEntryDraft: true, createdAt: '2020-01-01T00:00:00.000Z' },
      { id: 'new', quickEntryDraft: true, createdAt: '2026-11-01T00:00:00.000Z' },
      { id: 'other-manager', quickEntryDraft: true, createdAt: '2026-11-03T00:00:00.000Z' },
      { id: 'done', quickEntryDraft: false, quickProjectImportedCompleted: true, createdAt: '2026-11-02T00:00:00.000Z' },
    ],
  };
  const context: any = vm.createContext({ db, visibleOrdersForUser: () => db.orders.filter(order => order.id !== 'other-manager') });
  vm.runInContext(`${fn(stages, 'quickEntryDraftOrders')}; result = quickEntryDraftOrders();`, context);
  assert.deepEqual(Array.from(context.result, (order: any) => order.id), ['new', 'old']);
});

test('the historical-project surveyor can be cleared', () => {
  const order = { id: 'o', quickProjectImportedCompleted: false, measurerId: 'measurer' };
  const context: any = vm.createContext({
    getOrder: () => order,
    orderUserCanSeeMoney: () => true,
    currentUser: () => ({ role: 'owner' }),
    getUser: () => null,
    projectEstimateMarkChanged: () => undefined,
    save: () => undefined,
    refreshQuickProjectEntry: () => undefined,
  });
  vm.runInContext(`${fn(html, 'quickProjectUpdateHeader')}; quickProjectUpdateHeader('o', 'measurerId', '');`, context);
  assert.equal(order.measurerId, null);
});
