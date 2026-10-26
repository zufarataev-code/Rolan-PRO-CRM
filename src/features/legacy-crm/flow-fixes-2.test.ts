import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Second batch from the Owner's end-to-end user test, 2026-10-23: sizes that
// look measured but are not, 72 in that reads back as 72.01, «Sent» on a KP
// nobody sent, empty «Новая услуга» in the cashier, a stale «Ближайшее
// событие», English labels, and the new-client card.

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;

function slice(from: string, to: string) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return html.slice(start, end);
}
function run(code: string, globals: Row = {}) {
  const context: any = vm.createContext({ console, ...globals });
  vm.runInContext(code, context);
  return context;
}

test('inches survive the round trip: 72 in stays 72 in', () => {
  const db = { settings: { inputUnits: 'inches' } };
  const c = run(`const MM_PER_INCH = 25.4;\n${slice('function inches_to_mm(inch)', 'function mm_to_inches(mm)')}${slice('function mm_to_inches(mm)', '\n\n')}\n${slice('function measureInputToMm(value)', '// Compatibility helpers for historical v2.5 JSON exports.')}`, { db });
  for (const inches of [72, 36, 48, 60, 40.25]) assert.equal(c.measureMmToInput(c.measureInputToMm(String(inches))), inches);
  db.settings.inputUnits = 'mm';
  assert.equal(c.measureInputToMm('1829.4'), 1829, 'millimetre input stays whole');
});

test('a new window shows its typical size as a hint until a person types the size', () => {
  const c = run(slice('function windowSizeEntered(w)', 'function measureMmToInput(mm)'));
  assert.equal(c.windowSizeEntered({ sizePlaceholder: { width: true, height: true } }), false);
  assert.equal(c.windowSizeEntered({ sizePlaceholder: { height: true } }), false);
  assert.equal(c.windowSizeEntered({}), true, 'existing windows count as measured');
  const defaults = slice('function managerWindowDefaults(o, room, opts = {})', 'qty: 1,');
  assert.match(defaults, /sizePlaceholder: \{ width: true, height: true \}/);
  const dim = slice('function managerUpdateWinDim(oid, rid, wid, field, val)', 'markWindowMeasurementUnverified(w);');
  assert.match(dim, /delete w\.sizePlaceholder\[field\]/);
  assert.match(html, /\$\{w\.sizePlaceholder\?\.width \? `value="" placeholder=/);
  assert.match(slice('function managerMeasureProgressHtml(order', 'const steps = ['), /windowSizeEntered\(w\)/, '«Размеры» is not green on typical sizes');
  assert.match(slice('function orderMeasurementCompletionIssues(o, { film = true } = {})', '// Technical survey details'), /внесите ширину и высоту/);
  assert.match(slice('function projectEstimateReadiness(o)', 'return issues;'), /!windowSizeEntered\(win\)/);
  assert.match(slice('function managerConfirmWindowMeasurement(oid, rid, wid)', 'function managerUpdateWin('), /!windowSizeEntered\(w\)/);
});

test('draft services («Новая услуга» without a price) are left out of the cashier but kept in the owner directory', () => {
  const offerings = [
    { id: 'a', name: 'Ceramic', direction: 'solar', pricePerSqft: 15, active: true },
    { id: 'b', name: 'Новая услуга', direction: 'solar', pricePerSqft: 0, active: true },
    { id: 'c', name: 'Новая услуга', direction: 'solar', pricePerSqft: 7, active: true },
  ];
  const c = run(slice('function serviceOfferingIsDraft(item)', '/** The direction an offering is used under'), {
    serviceOfferingsAll: () => offerings,
    serviceOfferingInDirection: (item: Row, direction: string) => item.direction === direction,
  });
  assert.deepEqual(c.serviceOfferingsFor('solar').map((o: Row) => o.id), ['a', 'c'], 'a priced default name is a real service');
  assert.deepEqual(c.serviceOfferingsFor('solar', { includeInactive: true }).map((o: Row) => o.id), ['a', 'b', 'c']);
  assert.deepEqual(c.serviceOfferingsFor('solar', { includeId: 'b' }).map((o: Row) => o.id), ['a', 'b', 'c'], 'an old project keeps its own line');
  assert.match(html, /Черновик: заполните название и цену — до этого услуга не появится в проекте\./);
});

test('a published KP is «Отправлено» only after the manager shares it', () => {
  const prop: Row = { token: 't', orderId: 'o', status: 'Draft', version: 1, publishedAt: '2026-10-23T10:00:00Z' };
  const order: Row = { id: 'o', status: 'measurement_done' };
  const db: Row = { proposals: [prop] };
  const c = run(slice('function premiumMarkLatestProposalAccepted(order)', 'async function premiumSendCanonicalProposal(token)'), {
    db,
    state: { currentUserId: 'u', modal: '' },
    getPremiumProposalByToken: () => prop,
    getOrder: () => order,
    premiumProposalLocked: (p: Row) => p.status === 'Accepted',
    premiumStatusLabel: (s: string) => s,
    save: () => undefined,
    openPremiumProposalManagerModal: () => undefined,
    setTimeout: () => undefined,
  });
  assert.equal(c.premiumStatusLabelRu('Draft', prop), 'ссылка готова · ещё не отправлено');
  c.premiumMarkProposalSent('t', 'WhatsApp');
  assert.equal(prop.status, 'Sent');
  assert.equal(order.status, 'proposal_sent');
  assert.match(order.timeline[0].note, /WhatsApp/);
  assert.equal(c.premiumStatusLabelRu('Sent'), 'отправлено');

  c.premiumMarkLatestProposalAccepted(order);
  assert.equal(prop.status, 'Accepted', 'accepted outside the portal: the proposal says so too');

  const generator = slice('async function generatePremiumProposal(orderId)', 'function premiumMarkLatestProposalAccepted(order)');
  assert.doesNotMatch(generator, /prop\.status = 'Sent'/);
  const modal = slice('function openPremiumProposalManagerModal(token)', 'async function newPremiumProposalVersion(orderId)');
  assert.match(modal, /premiumMarkProposalSent\('\$\{prop\.token\}','WhatsApp'\)/);
  assert.match(modal, /Скопировать ссылку/);
  assert.match(modal, /Помещений/);
  assert.doesNotMatch(modal, /navigator\.clipboard\.writeText\(url\)/, 'opening the studio no longer overwrites the clipboard');
  assert.match(slice('function changeStatus(orderId, newStatus, by, opts = {})', 'o.timeline.push({ at: new Date().toISOString(), key: newStatus'), /if \(newStatus === 'proposal_accepted'\) premiumMarkLatestProposalAccepted\(o\);/);
});

test('the next step says «Отправить КП клиенту» while the link waits to be shared', () => {
  const db: Row = { proposals: [] };
  const c = run(slice('function projectProposalNextAction(o)', 'function orderPrimaryNextAction(o)'), { db });
  assert.equal(c.projectProposalNextAction({ id: 'o' }).title, 'Сформировать КП');
  db.proposals.push({ orderId: 'o', status: 'Draft', publishedAt: '2026-10-23' });
  assert.equal(c.projectProposalNextAction({ id: 'o' }).title, 'Отправить КП клиенту');
});

test('«Ближайшее событие» does not show a measurement that is already done', () => {
  const c = run(slice('function orderEventInfo(type)', '\n}\n') + '\n}\n' + slice('function orderClientActiveEvent(o)', 'function pendingClientRequests(o)'), {
    orderScheduledEvents: () => [{ type: 'install', at: '2099-10-30T16:00:00Z' }],
  });
  const done = c.orderClientActiveEvent({ status: 'measurement_done', measurementAt: '2026-10-26T17:00:00Z' });
  assert.equal(done.type, 'install', 'the future event, not the finished measurement');
  const booked = c.orderClientActiveEvent({ status: 'measurement_scheduled', measurementAt: '2026-10-26T17:00:00Z' });
  assert.equal(booked.type, 'measure');
  assert.match(html, /const nextEvent = orderClientActiveEvent\(o\) \|\| events\.filter\(ev => new Date\(ev\.at\) >= new Date\(\)\)/);
});

test('new client card: phone in one US form, search text carried over, empty required fields pointed at', () => {
  const c = run(slice('function normalizeClientPhone(value)', 'function createOrderClientFromOverlay()'));
  assert.equal(c.normalizeClientPhone('8185550123'), '+18185550123');
  assert.equal(c.normalizeClientPhone('(818) 555-0123'), '+18185550123');
  assert.equal(c.normalizeClientPhone('1 818 555 0123'), '+18185550123');
  assert.equal(c.normalizeClientPhone('+7 917 123 45 67'), '+7 917 123 45 67', 'foreign numbers are kept as typed');
  const opener = slice('function openOrderClientOverlay()', 'function normalizeClientPhone(value)');
  assert.match(opener, /getElementById\('no-client-search'\)/);
  const create = slice('function createOrderClientFromOverlay()', 'const existing = uniqueExistingClientByContact');
  assert.match(create, /normalizeClientPhone\(value\('oc-phone'\)\)/);
  assert.match(create, /scrollIntoView/);
  assert.match(html, /Без согласия клиент не получит SMS и email/);
  assert.match(html, /\[id\$="-company-block"\]\.hidden \{ display:none !important; \}/, 'B2C does not see the company field');
});

test('direction short names and the work order speak Russian', () => {
  const scopes = slice('const MEASURE_SCOPES = [', 'const MEASURE_GLASS_TYPES');
  for (const english of ["short: 'Solar'", "short: 'Smart'", "short: 'Security'", "short: 'Decor'", "short: 'Privacy'"]) assert.ok(!scopes.includes(english), english);
  assert.match(scopes, /short: 'Солнцезащитная'/);
  assert.match(html, /<b>Доступ:<\/b> \$\{academyEsc\(managerSolarAccessOption\(win\.access\)\?\.label/);
});

test('lin ft work is unknown (0) before the windows are measured, not «1 lin ft · $5»', () => {
  const sync = slice('function syncProjectIncludedServices(o)', 'function orderNeedsMeasurements(o)');
  assert.match(sync, /line\.unit === 'lft' && !allWindows\.length && orderNeedsMeasurements\(o\)\) \{[\s\S]*?qty = 0;/);
});
