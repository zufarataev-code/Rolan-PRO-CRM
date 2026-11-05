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
  for (const required of ['дата проекта', 'имя клиента', 'менеджер', 'замерщик']) assert.ok(create.includes(required), required);
  assert.match(create, /extraServices: \[\], extraExpenses: \[\]/, 'the header does not invent a first service');
  assert.match(create, /measurerId: f\.measurer/);
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

test('canonical editor supports many services with their own dates, crew, supplies and direct expenses', () => {
  assert.match(fn(html, 'renderQuickProjectEntry'), /Можно добавить несколько услуг/);
  assert.match(fn(html, 'renderQuickProjectEntry'), /projectEstimateAddQuickLine/);
  assert.match(fn(html, 'renderQuickProjectEntry'), /Начало работ/);
  assert.match(fn(html, 'renderQuickProjectEntry'), /projectQuickToggleInstaller/);
  assert.match(fn(html, 'renderQuickProjectEntry'), /projectQuickAddSupply/);
  assert.match(fn(html, 'renderQuickProjectEntry'), /projectQuickAddExpense/);
  assert.match(fn(html, 'closeQuickProjectAsCompleted'), /o\.status = full \? 'completed' : 'act_signed'/, 'partial payment leaves debt visible');
  assert.match(fn(html, 'closeQuickProjectAsCompleted'), /projectEstimateApprovalSnapshot\(o, recordedAt, true\)/);
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
      { id: 'done', quickEntryDraft: false, quickProjectImportedCompleted: true, createdAt: '2026-11-02T00:00:00.000Z' },
    ],
  };
  const context: any = vm.createContext({ db });
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
