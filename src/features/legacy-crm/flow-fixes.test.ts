import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner's end-to-end user test, 2026-10-23 (client → project → measurement →
// KP → installation → payment). Fixes for what stopped or misled the user:
// payment marked without money, no deposit step, an accepted calculation reset
// by edits that change no price, an empty film list, and a readiness check
// that hid what scheduling would refuse.

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;

function slice(from: string, to: string) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return html.slice(start, end);
}

function paymentContext(order: Row, revenue = 800) {
  const calls: string[] = [];
  const fields: Record<string, string> = {};
  const db: Row = { settings: { advancePct: 30 }, orders: [order] };
  const context: any = vm.createContext({
    db,
    state: { currentUserId: 'u_owner', modal: '' },
    console,
    getOrder: (id: string) => db.orders.find((o: Row) => o.id === id),
    getClient: () => ({ name: 'Иван' }),
    orderRevenue: () => revenue,
    uid: () => Math.random().toString(36).slice(2),
    save: () => calls.push('save'),
    render: () => calls.push('render'),
    closeModal: () => calls.push('close'),
    academyEsc: (v: unknown) => String(v ?? ''),
    fmtMoney: (v: number) => `$${Math.round(v)}`,
    orderUserCanSeeMoney: () => true,
    orderUserCanManage: () => true,
    currentUser: () => ({ role: 'owner' }),
    changeStatus: (id: string, status: string) => { calls.push(`status:${status}`); db.orders[0].status = status; return true; },
    alert: (m: string) => calls.push(`alert:${m}`),
    prompt: () => 'постоянный клиент',
    confirm: () => true,
    document: { getElementById: (id: string) => ({ value: fields[id] ?? '' }) },
    PAYMENT_METHODS: [{ id: 'zelle', label: 'Zelle' }],
  });
  vm.runInContext(slice('function orderPayments(o)', 'function renderPaymentsDue('), context);
  vm.runInContext(slice('function projectDepositExpected(o)', 'function orderPaymentReadyForProduction('), context);
  vm.runInContext(slice('function markDepositReceived(orderId)', '// ---------- CLIENT-SIDE PROPOSAL CONFIRMATION'), context);
  vm.runInContext('this.PAID = PAID_PROJECT_STATUSES;', context);
  return { context, calls, fields, db };
}

test('«Отметить оплату» never marks a project paid while money is owed', () => {
  const order: Row = { id: 'o', number: 'R-1', status: 'act_signed', payments: [] };
  const { context, calls, fields } = paymentContext(order);
  assert.equal(context.orderAmountDue(order), 800);
  assert.equal(context.ensurePaidForStatus(order, 'payment_received'), false, 'refused while $800 is due');
  assert.match(context.state.modal, /Оплата по проекту/);
  assert.match(context.state.modal, /к оплате \$800/);
  assert.match(context.state.modal, /value="800\.00"/, 'the balance is suggested');

  // A partial payment is kept; the status waits for the rest.
  fields['pay-amount'] = '300';
  fields['pay-method'] = 'zelle';
  context.confirmPayment('o');
  assert.equal(order.payments.length, 1);
  assert.equal(order.paid, 300);
  assert.equal(order.status, 'act_signed');
  assert.ok(calls.some(c => c.startsWith('alert:') && c.includes('Осталось получить $500')));

  // The rest arrives → the project becomes paid.
  context.openPaymentModal('o', { kind: 'final', thenStatus: 'payment_received' });
  fields['pay-amount'] = '500';
  context.confirmPayment('o');
  assert.equal(context.orderAmountDue(order), 0);
  assert.equal(order.status, 'payment_received');
  assert.equal(context.ensurePaidForStatus(order, 'completed'), true, 'already paid statuses pass');
  assert.equal(context.paymentLocalDate(new Date(2026, 9, 23, 23, 30)), '2026-10-23', 'the local day, not UTC');
});

test('a fully paid project and a project without a price pass the guard', () => {
  const paid: Row = { id: 'o', status: 'act_signed', payments: [{ amount: 800 }] };
  assert.equal(paymentContext(paid).context.ensurePaidForStatus(paid, 'payment_received'), true);
  const legacy: Row = { id: 'o', status: 'act_signed', paid: 800 };
  assert.equal(paymentContext(legacy).context.ensurePaidForStatus(legacy, 'payment_received'), true, 'legacy o.paid counts');
  const free: Row = { id: 'o', status: 'act_signed' };
  assert.equal(paymentContext(free, 0).context.ensurePaidForStatus(free, 'payment_received'), true);
  const other: Row = { id: 'o', status: 'installation_done' };
  assert.equal(paymentContext(other).context.ensurePaidForStatus(other, 'act_signed'), true, 'only «paid» statuses are guarded');
});

test('the deposit is a real payment, and «Без аванса» records who decided', () => {
  const order: Row = { id: 'o', number: 'R-1', status: 'proposal_accepted', paymentTerms: 'deposit_before_work' };
  const { context, fields } = paymentContext(order);
  assert.equal(context.projectDepositExpected(order), true);
  assert.equal(context.orderExpectedDeposit(order), 240);
  context.markDepositReceived('o');
  assert.match(context.state.modal, /Аванс по КП/);
  assert.match(context.state.modal, /value="240\.00"/);
  assert.match(context.state.modal, /Без аванса/);
  fields['pay-amount'] = '240';
  context.confirmPayment('o');
  assert.equal(order.depositReceived, true);
  assert.equal(order.payments[0].amount, 240);
  assert.equal(order.paid, 240, 'paid and payments agree');
  assert.equal(context.projectDepositExpected(order), false);

  const other: Row = { id: 'o', number: 'R-2', status: 'proposal_accepted', paymentTerms: 'deposit_before_work' };
  const second = paymentContext(other);
  second.context.waiveProjectDeposit('o');
  assert.ok(other.depositWaivedAt);
  assert.equal(other.depositWaivedBy, 'u_owner');
  assert.match(other.timeline?.[0]?.note ?? '', /Без аванса: постоянный клиент/);
  assert.equal(second.context.projectDepositExpected(other), false);
  const postpay: Row = { id: 'o', status: 'proposal_accepted', paymentTerms: 'after_completion' };
  assert.equal(paymentContext(postpay).context.projectDepositExpected(postpay), false, 'agreed post-pay asks for nothing');
});

test('the next step asks for the deposit after acceptance and for the payment amount after the act', () => {
  const next = slice('function orderPrimaryNextAction(o)', 'function installerOrderPrimaryAction(o)');
  assert.match(next, /projectDepositExpected\(o\)\) return \{ icon: '💰', title: 'Получить аванс'/);
  assert.match(next, /title: 'Получить оплату'/);
  assert.ok(next.includes("openPaymentModal('${o.id}',{kind:'final',thenStatus:'payment_received'})"));
  assert.match(next, /if \(changeStatus\('\$\{o\.id\}','completed'\)\) askForReview/);
  const change = slice('function changeStatus(orderId, newStatus, by, opts = {})', 'if (o.status === newStatus && !opts.force)');
  assert.match(change, /ensurePaidForStatus\(o, newStatus/);
});

function estimateContext(order: Row) {
  const context: any = vm.createContext({
    state: { currentUserId: 'u_owner' },
    console,
    projectLines: (o: Row) => o.lines,
    orderRevenue: (o: Row) => o.lines.reduce((s: number, l: Row) => s + l.price, 0),
    orderActualAreaSqft: (o: Row) => o.area,
    measureAllWindows: (o: Row) => o.windows.map((win: Row) => ({ win })),
  });
  vm.runInContext(slice('function projectEstimatePriceFingerprint(o)', '/**\n * ПОСТУПЛЕНИЯ ПО ЗАКАЗУ'), context);
  return context;
}

test('an approved calculation survives edits that change no price; a size change still reopens it', () => {
  const order: Row = {
    lines: [{ key: 'offering:a', qty: 42, price: 630 }], area: 42,
    windows: [{ id: 'w1', width: 1829, height: 1524, qty: 1, orientation: '' }],
  };
  const context = estimateContext(order);
  order.projectEstimateApprovedAt = '2026-10-23T10:00:00Z';
  order.projectEstimateFingerprint = context.projectEstimatePriceFingerprint(order);
  order.productionReadyAt = '2026-10-23T11:00:00Z';
  order.productionFingerprint = context.projectProductionFingerprint(order);

  order.windows[0].orientation = 'S'; // facade side, glass, installation side, confirming sizes…
  context.invalidateProjectEstimate(order, 'Изменены данные замера');
  assert.ok(order.projectEstimateApprovedAt, 'still approved');
  assert.ok(order.productionReadyAt, 'cut unchanged → production stays ready');
  assert.equal((order as Row).timeline, undefined, 'nothing reopened in the history');

  order.windows[0].filmDirection = 'vertical'; // the cut changes, the price does not
  context.invalidateProjectEstimate(order, 'Изменены данные замера');
  assert.ok(order.projectEstimateApprovedAt);
  assert.equal(order.productionReadyAt, null, 'a new cut needs a new production check');

  order.windows[0].width = 2000;
  order.area = 46;
  order.lines[0] = { key: 'offering:a', qty: 46, price: 690 };
  context.invalidateProjectEstimate(order, 'Изменены данные замера');
  assert.equal(order.projectEstimateApprovedAt, null, 'a new price needs a new approval');
  assert.equal(order.projectEstimateFingerprint, null);
  assert.equal((order as Row).timeline?.[0]?.key, 'project_estimate_reopened');
});

test('approval and production confirmation store the fingerprints the check compares', () => {
  assert.match(slice('function approveProjectEstimateAndOpenProposal(oid)', 'function projectQuickCompletionIssues('), /o\.projectEstimateFingerprint = projectEstimatePriceFingerprint\(o\);/);
  assert.match(slice('function confirmProjectProductionReady(oid)', 'function scheduleInstallationPrompt('), /o\.productionFingerprint = projectProductionFingerprint\(o\);/);
});

test('production readiness blocks unsafe Smart topology, not on-site Solar facts', () => {
  const readiness = slice('function projectProductionReadiness(o', 'const plan = calcFilmPlan(o);');
  assert.match(readiness, /orderInstallationBlockingTechnicalIssues/);
  assert.doesNotMatch(readiness, /orderTechnicalMeasurementIssues\(o\)/);
  assert.doesNotMatch(readiness, /замерщик должен уточнить/);
});

test('a service without linked films takes any film of its direction; linked films restrict, and only the owner links more', () => {
  const offering: Row = { id: 'ceramic', name: 'Ceramic', direction: 'solar', filmIds: [] };
  const catalog = [
    { id: 'f1', category: 'solar', model: 'Select 15' },
    { id: 'f2', category: 'solar', model: 'Select 5' },
    { id: 'f3', category: 'protective', model: 'A1' },
    { id: 'f4', category: 'solar', model: 'Old', archived: true },
  ];
  const win: Row = { id: 'w', offeringId: 'ceramic', measureScope: 'solar_film' };
  const order: Row = { id: 'o', serviceType: 'solar_film', measurements: { rooms: [{ id: 'r', windows: [win] }] } };
  let role = 'manager';
  const calls: string[] = [];
  const context: any = vm.createContext({
    db: { settings: { catalog } },
    console,
    currentUser: () => ({ role }),
    getOrder: () => order,
    getCatalogItem: (id: string) => catalog.find(f => f.id === id),
    serviceOffering: (id: string) => (id === 'ceramic' ? offering : null),
    primaryServiceInfo: () => ({ catalogCategory: 'solar' }),
    catalogMatchesCategory: (film: Row, category: string) => film.category === category,
    canonicalCatalogCategory: (value: string) => value,
    canonicalServiceDirection: (value: string) => value === 'privacy' ? 'decorative' : value,
    serviceDirectionAllowsFilm: (direction: string, film: Row) => (film.category === 'privacy' ? 'decorative' : film.category) === (direction === 'privacy' ? 'decorative' : direction),
    serviceOfferingDirection: () => 'solar',
    catalogLabel: (film: Row) => film.model,
    orderUserCanSeeMoney: () => true,
    invalidateProjectEstimate: () => calls.push('invalidate'),
    save: () => calls.push('save'),
    refreshManagerMeasureModal: () => calls.push('refresh'),
    refreshProjectEstimateWorkspace: () => calls.push('refreshEstimate'),
    confirm: () => true,
  });
  vm.runInContext(slice('function serviceOfferingFilmIds(offering)', '\n\n// How a service is priced'), context);
  vm.runInContext(slice('function projectWindowLinkableFilms(o, win, linked = [])', '// Services are projections of the existing commercial scope'), context);
  // Owner, 2026-10-24: direction → category → film, no linking needed.
  assert.deepEqual([...context.serviceOfferingAllowedFilmIds(offering)], ['f1', 'f2']);
  context.projectSetWindowSolution('o', 'r', 'w', 'catalogId', 'f2', true);
  assert.equal(win.catalogId, 'f2', 'a manager picks any film of the direction');
  assert.deepEqual([...offering.filmIds], [], 'nothing is linked behind the scenes');
  context.projectSetWindowSolution('o', 'r', 'w', 'catalogId', 'f3', true);
  assert.equal(win.catalogId, 'f2', 'a film of another direction is refused');

  offering.filmIds = ['f1'];
  assert.deepEqual([...context.serviceOfferingAllowedFilmIds(offering)], ['f1'], 'linked films restrict the choice');
  context.projectSetWindowSolution('o', 'r', 'w', 'catalogId', 'f1', true);
  context.projectSetWindowSolution('o', 'r', 'w', 'catalogId', 'f2', true);
  assert.equal(win.catalogId, 'f1', 'outside the linked list a manager cannot pick');
  role = 'owner';
  context.projectSetWindowSolution('o', 'r', 'w', 'catalogId', 'f2', true);
  assert.equal(win.catalogId, 'f2');
  assert.deepEqual([...offering.filmIds], ['f1', 'f2'], 'the owner links one more film after a confirm');

  const picker = slice('function projectWindowSolutionHtml(o, room, win, inMeasurement = false)', 'function projectWindowLinkableFilms(');
  assert.match(picker, /Другие плёнки направления — привяжутся к услуге/);
});
