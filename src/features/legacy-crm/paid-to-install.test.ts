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
  };
  vm.createContext(ctx);
  vm.runInContext(fn(html, 'markOrderDepositReceived') + ['projectPaidWithoutProposal', 'projectPaidWithoutProposalAction', 'projectAcceptPaidWithoutProposal'].map(n => fn(stages, n)).join(''), ctx);
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
