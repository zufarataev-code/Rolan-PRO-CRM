import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-24: «проверь роль замерщика со всего кабинета и мастера» and
// «хочу отправить инвойс коммерческим клиентам, чтобы они платили по счёту».

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
type Row = Record<string, any>;

function slice(src: string, from: string, to: string) {
  const start = src.indexOf(from);
  const end = src.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return src.slice(start, end);
}

test('the measurement studio measures for a service of the project, with its films', () => {
  const studio = slice(html, 'function measureStudioOrder()', 'function measureStudioWindowListHtml(order)');
  assert.match(studio, /projectSelectedSizedOfferings\(order, scopeKey\)/);
  assert.match(studio, /serviceOfferingSelectableFilms\(offering, selectedId\)/, 'only selectable films of the service direction');
  assert.match(studio, /projectOfferingCatalogId\(order, offering\.id\)/, 'the film chosen in the cashier comes first');
  assert.match(studio, /— уточнит менеджер —/);
  const save = slice(html, 'function measureStudioSaveWindow(orderId, options = {})', 'function measureSwapDims()');
  assert.match(save, /applyWindowOffering\(targetWin, offering\);/);
  assert.match(html, /\$\{measureStudioOfferingHtml\(order, scopeKey, win\)\}/);
});

test('«Завершить замер» is inside the studio; the measurer may leave the film to the manager', () => {
  assert.match(html, /onclick="measureStudioFinish\('\$\{order\.id\}'\)">Сохранить и завершить замер<\/button>/);
  const finish = slice(html, 'function measureStudioFinish(orderId)', 'function measureSwapDims()');
  assert.match(finish, /orderWorkflowTransitionIssues\(o, 'measurement_done'\)/);
  assert.match(finish, /box\.innerHTML = `<b>Чтобы сдать замер:<\/b>/, 'issues in place, not another window');
  assert.match(html, /if \(film && windows\.some\(\(\{ win \}\) => !windowCatalog\(win\)\)\)/);
  assert.match(html, /orderMeasurementCompletionIssues\(o, \{ film: currentUser\(\)\?\.role !== 'measurer' \}\)/);
});

test('field days are local: «сегодня/завтра/просрочен» and project numbers by the local date', () => {
  const c: any = vm.createContext({ Date });
  vm.runInContext(slice(html, 'function localDateKey(value = new Date()) {', 'function taskDueDateKey(') + slice(html, 'function fieldDayLabel(value) {', 'function orderMeasuredSqft('), c);
  const now = new Date();
  assert.equal(c.fieldDayLabel(now.toISOString()), 'сегодня');
  assert.equal(c.fieldDayLabel(new Date(now.getTime() + 86400000).toISOString()), 'завтра');
  assert.match(c.fieldDayLabel(new Date(now.getTime() - 3 * 86400000).toISOString()), /^просрочен · /);
  assert.doesNotMatch(html, /'R-' \+ new Date\(\)\.toISOString\(\)/);
  assert.equal((html.match(/'R-' \+ localDateKey\(\)\.slice\(2\)\.replace\(\/-\/g,''\)/g) || []).length, 3);
});

test('installer: one next step everywhere, overdue said so, pay on the card, map folded', () => {
  const dash = slice(html, 'function renderInstallerDashboard() {', 'async function renderInstallerMap(');
  assert.match(dash, /installerOrderPrimaryAction\(nextTask\)/);
  assert.match(dash, /Просрочено: \$\{overdue\.length\}/);
  assert.match(dash, /<details class="card mt-4 p-0 overflow-hidden installer-map-fold"/);
  const list = slice(html, 'function renderInstallerList(tasks) {', '\nfunction ');
  assert.doesNotMatch(list, /changeStatus\('\$\{o\.id\}','installation_done'\)/, 'done goes through «Мои услуги», not around it');
  assert.match(html, /title: 'Отметить мои услуги выполненными'/);
  assert.match(html, /Часы за последние 30 смен/);
});

function invoiceContext(order: Row, client: Row, settings: Row) {
  const c: any = vm.createContext({
    Date, Math, Number, String, JSON,
    db: { settings },
    state: {},
    getClient: () => client,
    projectLines: () => order.lines,
    projectProposalLineTitle: (line: Row) => line.en,
    orderRevenue: () => order.total,
    orderPaidTotal: () => order.paid,
    companyDepositFor: (total: number) => Math.min(total * 0.1, 1000),
    orderSiteType: () => order.siteType,
    orderAddress: () => '100 Main St, Los Angeles, CA',
    academyEsc: (v: unknown) => String(v ?? ''),
  });
  vm.runInContext(slice(html, 'function localDateKey(value = new Date()) {', 'function taskDueDateKey('), c);
  vm.runInContext(slice(stages, 'function invoiceTerms() {', 'function invoiceFormValues()'), c);
  vm.runInContext(slice(stages, 'function invoiceDocumentHtml(inv) {', 'function issueProjectInvoice(oid) {'), c);
  return c;
}

test('invoice: number, Net 15 for commercial, balance after payments, pay by transfer, Zelle or check', () => {
  const order = { number: 'R-261024-007', total: 12000, paid: 1000, siteType: 'COMMERCIAL', lines: [
    { en: 'Solar Window Film — 3M Prestige 70', qty: 400, unitShort: 'sq ft', price: 9000 },
    { en: 'Structural Silicone', qty: 120, unitShort: 'lin ft', price: 2500 },
    { en: 'Hidden', excluded: true, price: 99 },
  ] };
  const settings = { companyName: 'ROLANPRO LLC', officeAddress: 'Los Angeles, CA', clientPayments: { achEnabled: true, achInstructions: 'Bank: Chase', zelleEnabled: true, zelleRecipient: 'pay@rolanpro.com', zelleRecipientName: 'ROLANPRO LLC' } };
  const c = invoiceContext({ ...order }, { name: 'Ann Lee', companyName: 'Acme Offices Inc', email: 'ap@acme.com' }, settings);
  const inv = c.invoiceDraft({ ...order, invoices: [] }, { issued: '2026-10-24' });
  assert.equal(inv.number, 'INV-261024-007');
  assert.deepEqual([inv.terms, inv.due], ['net15', '2026-11-08']);
  assert.deepEqual([inv.total, inv.paid, inv.balance, inv.amount], [12000, 1000, 11000, 11000]);
  assert.equal(inv.lines.length, 3, 'two lines + an adjustment to the project total');
  assert.deepEqual(JSON.parse(JSON.stringify(inv.lines[2])), { title: 'Adjustment', qty: 0, unit: '', amount: 500 });
  assert.equal(inv.billTo.name, 'Acme Offices Inc');
  assert.equal(inv.billTo.attn, 'Ann Lee');
  assert.deepEqual([...inv.methods.map((m: Row) => m.key)], ['bank', 'zelle', 'check']);
  assert.match(inv.methods[2].text, /Payable to ROLANPRO LLC/);
  assert.equal(c.invoiceDraft({ ...order, invoices: [{}] }, { issued: '2026-10-24', mode: 'deposit' }).amount, 1000);
  assert.equal(c.invoiceDraft({ ...order, invoices: [{}] }, {}).number, 'INV-261024-007-2');
  const page = c.invoiceDocumentHtml(inv);
  assert.match(page, /<h1>INVOICE<\/h1>/);
  assert.match(page, /\$11,000\.00/);
  assert.match(page, /no processing fee/);
  assert.match(page, /Print \/ Save as PDF/);
});

test('invoice entry: project money actions (only functions, composed into the page), settings say where the bank details go', () => {
  assert.doesNotMatch(stages, /^const /m, 'production-ui composes functions only');
  assert.match(html, /title: 'Счёт \(Invoice\)'/);
  assert.match(html, /onclick: `openProjectInvoice\('\$\{o\.id\}'\)`/);
  assert.match(stages, /впишите их сами в «Настройки → Как клиент платит → Банковский перевод»/);
  assert.match(html, /Банковский перевод \(ACH \/ wire\) — для счетов и коммерческих клиентов/);
  assert.match(html, /db\.settings\.clientPayments\.checkMailingAddress=this\.value\.trim\(\)/);
});

test('client documents are in English: a Russian service name gets the owner EN name or a known one', () => {
  const c: any = vm.createContext({});
  vm.runInContext(slice(html, 'function serviceOfferingEnglishGuess(offering) {', '\n}\n') + '\n}\n', c);
  assert.equal(c.serviceOfferingEnglishGuess({ name: 'Силикон' }), 'Structural Silicone');
  assert.equal(c.serviceOfferingEnglishGuess({ name: 'Ceramic' }), '', 'a Latin name stays as is');
  assert.match(html, /return offering\?\.nameEn \|\| knownWork \|\| serviceOfferingEnglishGuess\(offering\) \|\| offering\?\.name/);
  assert.match(html, /updateServiceOffering\('\$\{offering\.id\}','nameEn',this\.value,this\)/);
});
