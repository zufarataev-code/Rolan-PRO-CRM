import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-24: «и снова не могу назначить монтаж» — a project paid in full by
// Zelle still had to make and send a KP before installation.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

function world(order: any) {
  const calls: string[] = [];
  const ctx: any = {
    calls, state: { currentUserId: 'u_o1' }, getOrder: () => order, currentUser: () => ({ role: 'owner' }),
    orderUserCanSeeMoney: () => true, orderUserCanSeeInternalEconomics: () => true,
    orderRevenue: () => 3416.67, orderPaidTotal: (o: any) => (o.payments || []).reduce((s: number, p: any) => s + p.amount, 0),
    companyDepositFor: (t: number) => Math.min(t * 0.1, 1000), fmtMoney: (v: number) => '$' + v,
    projectEstimateReadiness: () => [], projectEstimateIsApproved: (o: any) => !!o.projectEstimateApprovedAt,
    projectEstimateApprovalSnapshot: () => ({}), projectEstimatePriceFingerprint: () => 'fp',
    save: () => calls.push('save'), render: () => {}, alert: (m: string) => calls.push('alert:' + m),
    changeStatus: (_: string, s: string, __: unknown, opts: any) => { calls.push('status:' + s + ':' + !!opts.skipWorkflowGuard); order.status = s; return true; },
    projectLines: (o: any) => o.lines || [{ id: 'l1' }], getPremiumProposalByOrder: () => order.proposal || null,
    projectAcceptProposalOffline: () => { calls.push('offline'); if (order.offlineYes !== false) order.status = 'proposal_accepted'; },
    scheduleInstallationPrompt: () => calls.push('install-window'),
  };
  vm.createContext(ctx);
  vm.runInContext(fn(html, 'markOrderDepositReceived') + ['projectPaidShortcutStatuses', 'projectInstallShortcutStatuses', 'projectPaidWithoutProposal', 'projectPaidWithoutProposalAction', 'projectAcceptPaidWithoutProposal', 'projectInstallShortcutVisible', 'projectInstallShortcutHtml', 'projectStartInstallation'].map(n => fn(stages, n)).join(''), ctx);
  return ctx;
}

test('a project paid without a KP goes on to installation in one step', () => {
  const order: any = { id: 'o', status: 'measurement_done', payments: [{ amount: 3416.67 }], timeline: [] };
  const ctx = world(order);
  assert.equal(vm.runInContext('projectPaidWithoutProposal(getOrder())', ctx), true);
  assert.match(vm.runInContext('projectPaidWithoutProposalAction(getOrder()).title', ctx), /Оплачено → к монтажу/);
  vm.runInContext("projectAcceptPaidWithoutProposal('o')", ctx);
  assert.equal(order.status, 'proposal_accepted');
  assert.equal(order.depositReceived, true);
  assert.ok(order.projectEstimateApprovedAt);
  assert.ok(ctx.calls.includes('status:proposal_accepted:true'));
  assert.match(order.timeline.at(-1).note, /без КП — проект принят/);
});

test('no payment or a token payment keeps the KP path', () => {
  const ctx = world({ id: 'o', status: 'measurement_done', payments: [] });
  assert.equal(vm.runInContext('projectPaidWithoutProposal(getOrder())', ctx), false);
  const small = world({ id: 'o', status: 'measurement_done', payments: [{ amount: 20 }] });
  assert.equal(vm.runInContext('projectPaidWithoutProposal(getOrder())', small), false);
});

test('the paid shortcut comes before «Расчёт готов → КП» and «Отправить КП»', () => {
  const services = fn(html, 'projectServicesNextAction');
  assert.ok(services.indexOf('projectPaidWithoutProposal(o)') < services.indexOf("title: 'Расчёт готов → КП'"));
  const next = fn(html, 'orderPrimaryNextAction');
  assert.ok(next.indexOf('projectPaidWithoutProposal(o)') < next.indexOf("if (o.status === 'measurement_done') return projectProposalNextAction(o);"));
});

// Audit, 2026-11-17: a quick project (one total area) kept status «Новый» with the
// KP published and the deposit paid; «Назначить монтаж» never appeared.
test('a paid quick project still at «Новый» goes on to installation', () => {
  const order: any = { id: 'o', status: 'new', depositReceived: true, payments: [{ amount: 330 }], timeline: [] };
  const ctx = world(order);
  assert.equal(vm.runInContext('projectPaidWithoutProposal(getOrder())', ctx), true);
  const services = fn(html, 'projectServicesNextAction');
  assert.ok(services.indexOf('projectPaidWithoutProposal(o)') < services.indexOf('if (!projectMeasurementSettled(o))'), 'payment is checked before the measurement step');
  vm.runInContext("projectStartInstallation('o')", ctx);
  assert.equal(order.status, 'proposal_accepted');
  assert.deepEqual(ctx.calls.filter((c: string) => c === 'install-window'), ['install-window']);
});

test('«Назначить монтаж» stays on the card until the crew is booked', () => {
  const order: any = { id: 'o', status: 'measurement_done', payments: [], timeline: [] };
  const ctx = world(order);
  const visible = (primary: string) => vm.runInContext(`projectInstallShortcutVisible(getOrder(), { onclick: ${JSON.stringify(primary)} })`, ctx);
  assert.equal(visible("openProposalWizard('o')"), true);
  assert.match(vm.runInContext("projectInstallShortcutHtml(getOrder(), { onclick: '' })", ctx), /projectStartInstallation\('o'\)/);
  assert.equal(visible("scheduleInstallationPrompt('o')"), false, 'no second button when the next step is already installation');
  assert.equal(visible("projectAcceptPaidWithoutProposal('o')"), false);
  order.status = 'installation_scheduled';
  assert.equal(visible("openProposalWizard('o')"), false, 'a booked project plans in its own window');
  order.status = 'measurement_done'; order.lines = [];
  assert.equal(visible(''), false, 'nothing to install without services');
  assert.ok(stages.includes('${renderOrderActionCard(primary)}${projectInstallShortcutHtml(o, primary)}'), 'the card shows it beside the next step');
});

test('the shortcut records the client\'s yes the way the project allows', () => {
  const published: any = { id: 'o', status: 'measurement_done', payments: [], timeline: [], proposal: { publishedAt: '2026-11-17' } };
  const a = world(published);
  vm.runInContext("projectStartInstallation('o')", a);
  assert.deepEqual(a.calls, ['offline', 'install-window']);

  const declined: any = { id: 'o', status: 'proposal_sent', payments: [], timeline: [], proposal: { publishedAt: '2026-11-17' }, offlineYes: false };
  const b = world(declined);
  vm.runInContext("projectStartInstallation('o')", b);
  assert.deepEqual(b.calls, ['offline'], 'no window when the manager cancels the confirm');

  const bare: any = { id: 'o', status: 'new', payments: [], timeline: [] };
  const c = world(bare);
  vm.runInContext("projectStartInstallation('o')", c);
  assert.equal(bare.status, 'new');
  assert.match(c.calls[0], /^alert:.*сформируйте КП или отметьте оплату/);

  const accepted: any = { id: 'o', status: 'proposal_accepted', payments: [], timeline: [] };
  const d = world(accepted);
  vm.runInContext("projectStartInstallation('o')", d);
  assert.deepEqual(d.calls, ['install-window']);
});
