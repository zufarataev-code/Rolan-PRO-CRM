import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
function source(name: string) {
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end + 2);
}
function load(names: string[], values: Record<string, unknown>) {
  const context = vm.createContext(values);
  vm.runInContext(names.map(source).join('\n'), context);
  return context;
}
function stock(rolls: Array<Record<string, unknown>>, widths: Record<string, number> = { 1500: 5 }) {
  const movements: unknown[] = [];
  const c = load(['autoDeductInventoryForOrder', 'filmInventoryMaterialCost', 'orderFilmCost'], {
    filmPlanUsageByCatalog: () => ({ f: { widths } }),
    inventoryByCatalogId: () => rolls,
    filmCutRollFits: (actual: number, required: number) => actual >= required,
    filmCutCanonicalRollWidthMm: (x: number) => x,
    mm2_to_sqft: (x: number) => x / 92903.04,
    getCatalogItem: () => ({ costPerSqft: 1 }), catalogLabel: () => 'Film',
    recordInventoryMovement: (x: unknown) => movements.push(x), save: () => {},
    orderFilmCutMaterialCost: () => c.filmInventoryMaterialCost('f', { widths }, 1),
  });
  return { c, movements };
}

test('stock shortage leaves every roll untouched, then restock issues once', () => {
  const rolls = [{ id: 'a', widthMm: 1500, remainingLengthM: 2, originalLengthM: 10, costTotal: 100 }];
  const { c, movements } = stock(rolls);
  const order: Record<string, unknown> = { id: 'o' };
  assert.equal(c.autoDeductInventoryForOrder(order).ok, false);
  assert.equal(rolls[0].remainingLengthM, 2);
  assert.equal(order._inventoryDeducted, undefined);
  assert.equal(movements.length, 0);
  rolls[0].remainingLengthM = 10;
  assert.equal(c.autoDeductInventoryForOrder(order).ok, true);
  assert.equal(rolls[0].remainingLengthM, 5);
  assert.equal(c.autoDeductInventoryForOrder(order).ok, true);
  assert.equal(rolls[0].remainingLengthM, 5);
  assert.equal(movements.length, 1);
});

test('the cost of issued lots survives restock and catalogue changes', () => {
  const rolls = [
    { id: 'a', widthMm: 1500, remainingLengthM: 5, originalLengthM: 5, costTotal: 100, dateReceived: '2026-10-01' },
    { id: 'b', widthMm: 1500, remainingLengthM: 10, originalLengthM: 10, costTotal: 600, dateReceived: '2026-10-02' },
  ];
  const { c } = stock(rolls);
  const order = { id: 'o' };
  assert.equal(c.orderFilmCost(order), 100);
  c.autoDeductInventoryForOrder(order);
  assert.equal(c.orderFilmCost(order), 100);
  rolls[1].costTotal = 900;
  c.getCatalogItem = () => ({ costPerSqft: 99 });
  assert.equal(c.orderFilmCost(order), 100);
});

test('wide cuts are allocated first and a roll cannot serve two widths twice', () => {
  const rolls = [
    { id: 'wide', widthMm: 1800, remainingLengthM: 5, originalLengthM: 5, costTotal: 100 },
    { id: 'narrow', widthMm: 1500, remainingLengthM: 5, originalLengthM: 5, costTotal: 50 },
  ];
  const { c } = stock(rolls, { 1500: 5, 1800: 5 });
  assert.equal(c.autoDeductInventoryForOrder({ id: 'o' }).ok, true);
  assert.equal(rolls[0].remainingLengthM, 0);
  assert.equal(rolls[1].remainingLengthM, 0);
  const insufficient = stock([{ id: 'wide', widthMm: 1800, remainingLengthM: 5 }], { 1500: 5, 1800: 5 });
  assert.equal(insufficient.c.autoDeductInventoryForOrder({ id: 'o' }).ok, false);
  assert.equal(insufficient.movements.length, 0);
});

test('old partial issues resume only the missing metres without inventing old cost', () => {
  const rolls = [{ id: 'a', widthMm: 1500, remainingLengthM: 10, originalLengthM: 10, costTotal: 100 }];
  const { c } = stock(rolls);
  const order: Record<string, unknown> = { id: 'o', _inventoryDeducted: true, _inventoryLog: [
    { catId: 'f', rollId: 'a', widthMm: 1500, lengthM: 2 },
    { catId: 'f', widthMm: 1500, lengthM: 3, warning: 'shortage' },
  ] };
  c.autoDeductInventoryForOrder(order);
  assert.equal(rolls[0].remainingLengthM, 7);
  assert.equal(order._inventoryMaterialCost, undefined);
  c.autoDeductInventoryForOrder(order);
  assert.equal(rolls[0].remainingLengthM, 7);
});

function payroll(payments: unknown[], orders: unknown[] = []) {
  return load(['payrollPeriodAllocatedAmount', 'payrollPaidForPeriod'], {
    db: { payrollPayments: payments, orders }, financeDate: (x: string) => new Date(x),
    getUser: () => ({ role: 'installer' }),
  });
}
const first = [new Date('2026-10-01T00:00:00'), new Date('2026-10-07T23:59:59')];
const second = [new Date('2026-10-08T00:00:00'), new Date('2026-10-14T23:59:59')];

test('one monthly payment offsets only the jobs earned in each week', () => {
  const c = payroll([{ id: 'p', userId: 'i', amount: 1000, periodStart: '2026-10-01', periodEnd: '2026-10-31', allocations: [
    { orderId: 'a', amount: 400, date: '2026-10-03T12:00:00' },
    { orderId: 'b', amount: 600, date: '2026-10-10T12:00:00' },
  ] }]);
  assert.equal(c.payrollPaidForPeriod('i', ...first), 400);
  assert.equal(c.payrollPaidForPeriod('i', ...second), 600);
  assert.equal(c.payrollPaidForPeriod('other', ...first), 0);
});

test('historical batches reconstruct earned dates without counting linked payouts twice', () => {
  const c = payroll([{ id: 'p', userId: 'i', amount: 1000 }], [
    { installationDoneAt: '2026-10-03', payouts: [{ userId: 'i', amount: 400, paid: true, paymentBatchId: 'p' }] },
    { installationDoneAt: '2026-10-10', payouts: [{ userId: 'i', amount: 600, paid: true, paymentBatchId: 'p' }] },
  ]);
  assert.equal(c.payrollPaidForPeriod('i', ...first), 400);
  assert.equal(c.payrollPaidForPeriod('i', ...second), 600);
});

test('undetailed salary batches conserve their amount across disjoint periods', () => {
  const c = payroll([{ userId: 'i', amount: 3100, periodStart: '2026-10-01T00:00:00', periodEnd: '2026-10-31T23:59:59' }]);
  assert.equal(c.payrollPaidForPeriod('i', ...first), 700);
  assert.equal(c.payrollPaidForPeriod('i', ...second), 700);
  assert.equal(c.payrollPaidForPeriod('i', new Date('2026-10-15T00:00:00'), new Date('2026-10-31T23:59:59')), 1700);
});

test('fractional salary allocations conserve cents across every day of a month', () => {
  const c = payroll([{ userId: 'i', amount: 1000, periodStart: '2026-10-01T00:00:00', periodEnd: '2026-10-31T23:59:59' }]);
  let total = 0;
  for (let day = 1; day <= 31; day++) total += c.payrollPaidForPeriod('i', new Date(2026, 9, day), new Date(2026, 9, day, 23, 59, 59));
  assert.equal(Number(total.toFixed(2)), 1000);
});

test('paying one week then the month allocates only the remaining accruals', () => {
  const orders = [
    { id: 'a', number: 'A', installerIds: ['i'], installationDoneAt: '2026-10-03T12:00:00', amount: 400 },
    { id: 'b', number: 'B', installerIds: ['i'], installationDoneAt: '2026-10-10T12:00:00', amount: 600 },
  ];
  const db = { orders, payrollPayments: [] as Array<{ amount: number; allocations: Array<{ amount: number }> }> };
  const c = load(['payrollPeriodAllocatedAmount', 'payrollPaidForPeriod', 'calcUserPayoutForPeriod', 'markPayoutPaid'], {
    db, getUser: () => ({ id: 'i', name: 'Installer', role: 'installer', payConfig: { type: 'per_sqft' } }),
    getOrder: (id: string) => orders.find(x => x.id === id), financeDate: (x: string) => new Date(x),
    orderInstallerPayoutForUser: (o: { amount: number }) => o.amount,
    orderActualAreaSqft: () => 100, fmtMoney: String, uid: () => String(db.payrollPayments.length),
    state: { currentUserId: 'owner' }, save: () => {}, render: () => {}, confirm: () => true, alert: () => {},
  });
  c.markPayoutPaid('i', first[0].toISOString(), first[1].toISOString());
  c.markPayoutPaid('i', new Date('2026-10-01T00:00:00').toISOString(), new Date('2026-10-31T23:59:59').toISOString());
  assert.deepEqual(db.payrollPayments.map(x => x.amount), [400, 600]);
  assert.equal(db.payrollPayments[1].allocations.reduce((sum, x) => sum + x.amount, 0), 600);
  c.markPayoutPaid('i', second[0].toISOString(), second[1].toISOString());
  assert.equal(db.payrollPayments.length, 2, 'already-paid week does not create another payment');
});

test('actual month economics exclude drafts and cancellations while a draft has its own forecast', () => {
  const orders = [
    { id: 'a', status: 'completed', revenue: 10000 },
    { id: 'b', status: 'new', revenue: 20000 },
    { id: 'c', status: 'cancelled', installationDoneAt: '2026-10-01', revenue: 30000 },
  ];
  const c = load(['projectProfitIsActual', 'projectProfitIsExcluded', 'projectMonthKey', 'projectMonthRevenueMap', 'projectMonthRevenue', 'projectRevenueShare', 'projectProfitMonthOrders'], {
    db: { orders }, orderRevenue: (o: { revenue: number }) => o.revenue,
    projectProfitDate: () => new Date('2026-10-10T12:00:00'), queueMicrotask,
  });
  vm.runInContext('let projectMonthRevenueCache = null;', c);
  assert.equal(c.projectRevenueShare(orders[0]), 1);
  assert.equal(c.projectRevenueShare(orders[2]), 0);
  assert.equal(c.projectProfitMonthOrders(orders[0]).length, 1);
  assert.equal(c.projectProfitMonthOrders(orders[1]).length, 2);
  assert.equal(c.projectRevenueShare(orders[1]), 2 / 3);
});

test('failed material issue cannot complete the project or send completion notifications', () => {
  const order = { id: 'o', status: 'installation_in_progress' };
  let notified = false;
  const c = load(['changeStatus'], {
    getOrder: () => order, currentUser: () => ({ role: 'owner' }), PROJECT_SCHEDULED_STATUSES: ['installation_in_progress'], CLOSED_PROJECT_STATUSES: ['installation_done', 'completed'],
    projectPlanSnapshot: () => () => {}, ensureProjectServicesPlanned: () => true,
    ensureOrderWorkflowTransition: () => true, ensureVerifiedMeasurementsForStatus: () => true,
    autoDeductInventoryForOrder: () => ({ ok: false, shortages: [{ warning: 'shortage' }] }),
    notifyStatusChange: () => { notified = true; }, alert: () => {}, console,
  });
  assert.equal(c.changeStatus('o', 'installation_done'), false);
  assert.equal(c.changeStatus('o', 'completed'), false);
  assert.equal(order.status, 'installation_in_progress');
  assert.equal(notified, false);
});

test('an installer can report completion without access to the private warehouse payload', () => {
  const order = { id: 'o', status: 'installation_in_progress' };
  const c = load(['changeStatus'], {
    getOrder: () => order, currentUser: () => ({ role: 'installer' }),
    PROJECT_SCHEDULED_STATUSES: ['installation_in_progress'], CLOSED_PROJECT_STATUSES: ['installation_done'],
    projectPlanSnapshot: () => () => {}, ensureProjectServicesPlanned: () => true,
    ensureOrderWorkflowTransition: () => true, ensureVerifiedMeasurementsForStatus: () => true,
    autoDeductInventoryForOrder: () => { assert.fail('field roles cannot issue from the private warehouse'); },
    state: { currentUserId: 'i' }, save: () => {}, notifyStatusChange: () => {}, render: () => {},
  });
  assert.equal(c.changeStatus('o', 'installation_done', 'i', { skipClientAuto: true }), true);
  assert.equal(order.status, 'installation_done');
  assert.match(html, /Расход материала ещё не подтверждён на складе/);
  assert.match(html, /Подтвердить расход материала/);
});
