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
  assert.match(create, /historicalMeasurementDate: measurementDate \|\| null/, 'the actual survey date is stored independently from installation dates');
  assert.match(create, /actor\?\.role === 'owner' \? f\.manager : actor\?\.id/, 'a manager cannot create an inaccessible draft for another manager');
  assert.match(create, /managerId,/);
  assert.match(create, /quickEntryDraft: true/);
  assert.match(create, /openQuickProjectEntry\(o\.id\)/, 'the existing project editor owns services, expenses and closing');
  assert.doesNotMatch(create, /quickEntryComplete\(/, 'creating the header must not close the project automatically');
});

test('completed historical material cost is frozen instead of following later warehouse prices', () => {
  const cost = fn(html, 'orderFilmCost');
  const productionCost = fn(stages, 'orderFilmCost');
  assert.match(cost, /quickProjectImportedCompleted === true && Number\.isFinite\(o\._historicalMaterialCost\)/);
  assert.match(productionCost, /quickProjectImportedCompleted === true && Number\.isFinite\(o\._historicalMaterialCost\)/);
  assert.ok(cost.indexOf('_historicalMaterialCost') < cost.indexOf('_inventoryMaterialCost'));
  assert.ok(productionCost.indexOf('_historicalMaterialCost') < productionCost.indexOf('_inventoryMaterialCost'));
});

test('completed historical supply cost is frozen instead of following later warehouse receipts', () => {
  const cost = fn(html, 'projectQuickSupplyCost');
  assert.match(cost, /quickProjectImportedCompleted === true && Number\.isFinite\(o\._historicalSupplyCost\)/);
  assert.ok(cost.indexOf('_historicalSupplyCost') < cost.indexOf('ensureSupplies'));
});

test('historical service plans preserve both the start and end dates', () => {
  const assignment = fn(html, 'projectServiceAssignment');
  const plans = fn(html, 'projectPlannedSchedules');
  assert.match(assignment, /endsAt: line\?\.endDate \? `\$\{line\.endDate\}T17:00:00` : ''/);
  assert.match(plans, /endsAt: assignment\.endsAt \|\| ''/);
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
  for (const field of ['date', 'measurementDate', 'manager', 'client', 'phone', 'street', 'city', 'source', 'site', 'measurer', 'notes']) assert.ok(read.includes(`'${field}'`), field);
});

test('owner can be the surveyor without duplicating the employee card', () => {
  assert.match(fn(stages, 'quickEntryMeasurers'), /\['measurer', 'owner'\]\.includes/);
  assert.match(stages, /Замерщик<select id="qe-measurer"/);
  assert.match(stages, /Фактическая дата замера<input id="qe-measurementDate"/);
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
  assert.match(renderer, /projectQuickUpdateIncludedQty/);
  assert.match(renderer, /Входит в пакет — фактическое количество/);
  assert.match(renderer, /projectQuickAddExpense/);
  assert.match(renderer, /\['owner', 'manager'\]\.includes\(quickRole\)/, 'owner and manager can fill dates, crew and supplies');
  assert.match(renderer, /canCloseHistoricalProject = quickRole === 'owner'/, 'only the owner confirms money and closes the import');
  assert.match(renderer, /canReassignHistoricalManager = quickRole === 'owner'/, 'only the owner can reassign the project manager');
  assert.match(renderer, /Number\.isFinite\(Number\(o\.paid\)\) \? Math\.max\(0, Number\(o\.paid\)\) : 0/, 'an unpaid import must remain at zero instead of looking fully paid');
  assert.match(fn(html, 'projectQuickCompletionIssues'), /quickLines\.some\(line => !line\.offeringId\)/, 'every imported row must choose a concrete service');
  assert.match(fn(html, 'projectQuickCompletionIssues'), /includedLines\.some\(line => Number\(line\.qty\) <= 0\)/, 'every included historical job requires its actual unit quantity');
  assert.match(renderer, /line\.unit === 'sqft' \? projectQuickLineFilms\(line, \{ allowOutOfStock: o\.quickEntryDraft \}\)/, 'a historical film remains selectable even when current stock is zero');
  assert.match(renderer, /projectHistoricalEntryLines\(o\)/, 'film and size-free services share the historical editor');
  const updater = fn(html, 'projectEstimateUpdateQuickLine');
  assert.match(updater, /!serviceOfferingNeedsSizes\(offering\)/);
  assert.match(updater, /projectOfferingLine\(offering/);
  assert.match(fn(html, 'projectQuickCompletionIssues'), /line\.unit === 'sqft' && !line\.catalogId/, 'only a film service requires warehouse film');
  assert.doesNotMatch(renderer, /openProjectEstimateWorkspace/, 'a historical import cannot enter the client proposal flow');
  assert.doesNotMatch(renderer, /сформировать КП/, 'the import UI must not advertise a retroactive proposal');
  const close = fn(html, 'closeQuickProjectAsCompleted');
  assert.match(close, /o\.status = full \? 'completed' : 'act_signed'/, 'partial payment leaves debt visible');
  assert.match(close, /const measurementDate = projectQuickDateValue\(o\.historicalMeasurementDate\)/);
  assert.match(close, /o\.measurementDoneAt = o\.measurerId \? \(o\.measurementDoneAt \|\| measurementAt\) : null/, 'fixed-per-job surveyor payroll uses the actual survey date, not installation');
  assert.match(renderer, /Фактическая дата замера/);
  assert.match(close, /projectEstimateApprovalSnapshot\(o, recordedAt, true\)/);
});

test('historical material selection never creates current warehouse demand', () => {
  const update = fn(html, 'projectEstimateUpdateQuickLine');
  const remove = fn(html, 'projectEstimateDeleteQuickLine');
  assert.match(fn(html, 'projectQuickLineCatalog'), /allowOutOfStock \|\| item\.id === selectedCatalogId/);
  assert.match(update, /!o\.quickEntryDraft && warehouseCatalogStockStats\(catalog\.id\)\.availableSqft <= 0/);
  assert.match(update, /if \(!o\.quickEntryDraft\) \{[\s\S]*reconcileManualFilmPurchase/);
  assert.match(remove, /removedCatalogId && !o\.quickEntryDraft/);
});

test('unfinished historical imports stay out of every financial rollup until owner closure', () => {
  const draft = { id: 'draft', quickEntryDraft: true, quickProjectImportedCompleted: false, paid: 0 };
  const closed = { id: 'closed', quickEntryDraft: false, quickProjectImportedCompleted: true, paid: 25 };
  const context: any = vm.createContext({
    db: { orders: [draft, closed] },
    orderPaidTotal: (order: any) => Number(order.paid) || 0,
    orderRevenue: () => 100,
  });
  vm.runInContext(`${fn(html, 'orderIsHistoricalDraft')}; ${fn(html, 'orderIncludedInFinancialReports')}; ${fn(html, 'financialOrders')}; ${fn(html, 'orderDebt')}; result = { ids: financialOrders().map(o => o.id), draftDebt: orderDebt(db.orders[0]), closedDebt: orderDebt(db.orders[1]) };`, context);
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

test('unfinished historical imports stay out of installer work and pay views', () => {
  const draft = { id: 'draft', installerIds: ['installer'], quickEntryDraft: true, quickProjectImportedCompleted: false };
  const closed = { id: 'closed', installerIds: ['installer'], quickEntryDraft: false, quickProjectImportedCompleted: true };
  const context: any = vm.createContext({
    db: { orders: [draft, closed] },
    orderIsHistoricalDraft: (order: any) => order.quickEntryDraft === true && order.quickProjectImportedCompleted !== true,
  });
  vm.runInContext(`${fn(html, 'installerVisibleOrders')}; result = installerVisibleOrders('installer').map(order => order.id);`, context);
  assert.deepEqual(Array.from(context.result), ['closed']);
  for (const name of ['renderInstallerDashboard', 'buildInstallerRoute', 'renderInstallerPayHistory', 'renderInstallerAnalytics', 'renderInstallerTasks', 'buildDayRouteBar']) {
    assert.match(fn(html, name), /installerVisibleOrders\(u\.id\)/, name);
  }
});

test('unfinished historical imports stay out of surveyor work and route views', () => {
  const draft = { id: 'draft', measurerId: 'measurer', quickEntryDraft: true, quickProjectImportedCompleted: false };
  const closed = { id: 'closed', measurerId: 'measurer', quickEntryDraft: false, quickProjectImportedCompleted: true };
  const context: any = vm.createContext({
    db: { orders: [draft, closed] },
    orderIsHistoricalDraft: (order: any) => order.quickEntryDraft === true && order.quickProjectImportedCompleted !== true,
  });
  vm.runInContext(`${fn(html, 'measurerVisibleOrders')}; result = measurerVisibleOrders('measurer').map(order => order.id);`, context);
  assert.deepEqual(Array.from(context.result), ['closed']);
  assert.match(fn(html, 'renderMeasurerDashboard'), /measurerVisibleOrders\(u\.id\)/);
  assert.match(fn(html, 'renderMeasurerTasks'), /measurerVisibleOrders\(u\.id\)/);
  assert.match(fn(html, 'buildMeasurerRouteBar'), /measurerVisibleOrders\(u\.id\)/);
});

test('unfinished historical imports cannot leak into the live project funnel', () => {
  assert.match(fn(html, 'renderOrders'), /visibleOrdersForUser\(u\)[\s\S]*\.filter\(order => !orderIsHistoricalDraft\(order\)\)/);
  assert.match(fn(html, 'kanbanMoveOrder'), /if \(orderIsHistoricalDraft\(o\)\)[\s\S]*openQuickProjectEntry\(o\.id\)[\s\S]*return false/);
  assert.match(fn(html, 'changeStatus'), /if \(o\?\.quickEntryDraft === true && o\?\.quickProjectImportedCompleted !== true\)[\s\S]*openQuickProjectEntry\(o\.id\)[\s\S]*return false/);
  assert.match(fn(html, 'openOrder'), /if \(orderIsHistoricalDraft\(order\)\)[\s\S]*openQuickProjectEntry\(id\)[\s\S]*return/);
  assert.match(fn(html, 'renderOrderDetails'), /Черновик переноса[\s\S]*Продолжить перенос/);
  for (const name of ['renderManagerDashboardLegacy', 'renderPrecisionManagerDashboard', 'agentInsights', 'openCalendarSchedulePicker']) {
    assert.match(fn(html, name), /orderIsHistoricalDraft/, name);
  }
});

test('historical imports never trigger automatic customer follow-ups', () => {
  const scheduler = fn(html, 'runFollowUpScheduler');
  assert.match(scheduler, /o\.quickEntry === true \|\| o\.quickEntryDraft === true \|\| o\.quickProjectImportedCompleted === true\) continue/);
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
  assert.match(sync, /o\.quickEntry \? projectHistoricalEntryLines\(o\) : projectQuickLines\(o\)/);
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

test('the historical-project actual survey date can be corrected independently', () => {
  const order: any = { id: 'o', quickProjectImportedCompleted: false, historicalMeasurementDate: '2026-10-01' };
  const context: any = vm.createContext({
    getOrder: () => order,
    orderUserCanSeeMoney: () => true,
    currentUser: () => ({ role: 'owner' }),
    projectQuickDateValue: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : '',
    projectEstimateMarkChanged: () => undefined,
    save: () => undefined,
    refreshQuickProjectEntry: () => undefined,
  });
  vm.runInContext(`${fn(html, 'quickProjectUpdateHeader')}; quickProjectUpdateHeader('o', 'historicalMeasurementDate', '2026-09-15');`, context);
  assert.equal(order.historicalMeasurementDate, '2026-09-15');
});
