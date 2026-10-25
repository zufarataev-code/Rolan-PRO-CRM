import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-24: «логика оплаты из КП не работает». The client signed the KP
// online and chose Zelle; the project still waited. A $3 416 Zelle payment
// recorded without a KP did not count as the deposit.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(src.lastIndexOf('\n', a) + 1, src.indexOf('\n}\n', a) + 3); };

function world(order: any, prop: any) {
  const calls: string[] = [];
  const ctx: any = {
    state: { currentUserId: 'u_o1' }, calls,
    getOrder: () => order, getPremiumProposalByOrder: () => prop,
    orderPayments: (o: any) => (o.payments = o.payments || []),
    orderPaidTotal: (o: any) => (o.payments || []).reduce((s: number, p: any) => s + p.amount, 0),
    addOrderPayment: (_: string, d: any) => order.payments.push({ ...d }),
    changeStatus: (_: string, status: string) => { calls.push('status:' + status); order.status = status; prop.status = 'Accepted'; return true; },
    fmtMoney: (v: number) => '$' + v, save: () => calls.push('save'), render: () => {},
    orderRevenue: () => 3416.67, companyDepositFor: (t: number) => Math.min(t * 0.1, 1000),
  };
  vm.createContext(ctx);
  vm.runInContext(fn(html, 'markOrderDepositReceived') + fn(html, 'paymentCoversDeposit') + fn(html, 'kpOnlinePaymentMethod') + fn(stages, 'premiumApplyServerProposalState'), ctx);
  return ctx;
}

test('a KP signed online moves the project to «КП принято» and remembers the chosen payment', () => {
  const order: any = { id: 'o', status: 'measurement_done', payments: [], timeline: [] };
  const prop: any = { status: 'Draft' };
  const ctx = world(order, prop);
  ctx.server = { client_viewed_at: '2026-10-24T19:47:57Z', agreement: { status: 'signed', signed_at: '2026-10-24T19:49:19Z', signer_name: 'Galina Ataeva' }, deposit: { deposit_id: 'd1', amount: 520.83, status: 'pending', payment_method: 'zelle' } };
  assert.equal(vm.runInContext("premiumApplyServerProposalState('o', server)", ctx), true);
  assert.deepEqual(ctx.calls.filter((c: string) => c.startsWith('status')), ['status:proposal_accepted']);
  assert.equal(order.kpOnline.method, 'zelle');
  assert.equal(order.kpOnline.depositId, 'd1');
  assert.match(order.timeline[0].note, /Клиент подписал КП онлайн · Galina Ataeva/);
  assert.equal(order.depositReceived, undefined, 'Zelle is confirmed by the owner, not assumed');
  // A second sync changes nothing.
  assert.equal(vm.runInContext("premiumApplyServerProposalState('o', server)", ctx), false);
});

test('a deposit paid online (card) becomes a payment and the deposit once', () => {
  const order: any = { id: 'o', status: 'proposal_accepted', payments: [], timeline: [] };
  const ctx = world(order, { status: 'Accepted' });
  ctx.server = { agreement: { status: 'signed', signed_at: 'x' }, deposit: { deposit_id: 'd1', amount: 341.67, status: 'paid', payment_method: 'payment_system', paid_at: '2026-10-25T01:00:00Z' } };
  vm.runInContext("premiumApplyServerProposalState('o', server)", ctx);
  vm.runInContext("premiumApplyServerProposalState('o', server)", ctx);
  assert.equal(order.payments.length, 1);
  assert.equal(order.payments[0].method, 'card');
  assert.equal(order.depositReceived, true);
});

test('a payment that covers the deposit counts as the deposit; a small one does not', () => {
  const order: any = { id: 'o', payments: [{ amount: 3416.67 }] };
  const ctx = world(order, {});
  assert.equal(vm.runInContext('paymentCoversDeposit(getOrder(), 3416.67)', ctx), true);
  order.payments = [{ amount: 50 }];
  assert.equal(vm.runInContext('paymentCoversDeposit(getOrder(), 50)', ctx), false);
  const confirm = fn(html, 'confirmPayment');
  assert.match(confirm, /flow\.kind === 'deposit' \|\| paymentCoversDeposit\(o, amount\)/);
  assert.match(confirm, /syncServerDepositPaid\(o\);/);
  assert.match(fn(html, 'syncServerDepositPaid'), /\/api\/v1\/deposits\/\$\{encodeURIComponent\(depositId\)\}\/pay/);
});

test('opening the project reads the KP from the server; the deposit step names the client’s choice', () => {
  assert.match(fn(stages, 'projectFeedHtml'), /setTimeout\(\(\) => premiumSyncClientProposal\(o\.id\), 0\);/);
  assert.match(fn(stages, 'premiumSyncClientProposal'), /\/api\/v1\/proposals\/\$\{encodeURIComponent\(prop\.canonicalProposalId\)\}/);
  assert.match(html, /Клиент подписал КП и выбрал \$\{paymentMethodLabel\(kpOnlinePaymentMethod\(o\.kpOnline\.method\)\)\}/);
});
