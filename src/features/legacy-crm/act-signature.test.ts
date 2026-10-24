import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-23: «Акт подписан» was a button. The client now signs on
// screen; the CRM's messages open as CRM cards instead of browser windows.

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
type Row = Record<string, any>;
function slice(from: string, to: string) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return html.slice(start, end);
}

function signatureContext(order: Row) {
  const calls: string[] = [];
  const fields: Record<string, any> = { 'act-sign-name': { value: 'Michael Brown' }, 'act-sign-accept': { checked: true } };
  const canvas = { dataset: { strokes: '12' }, width: 600, height: 220, toDataURL: () => 'data:image/png;base64,AAAA', getContext: () => ({ clearRect: () => calls.push('clear') }) };
  const c: any = vm.createContext({
    console,
    state: { currentUserId: 'u_inst', modal: '' },
    db: { settings: { companyName: 'RolanPRO' } },
    getOrder: () => order,
    getClient: () => ({ name: 'Michael Brown' }),
    orderAddress: () => '14500 Ventura Blvd',
    projectLines: () => [{ name: 'Ceramic', qty: 42, unitShort: 'sq ft' }, { name: 'Силикон', qty: 54, unitShort: 'lin ft', excluded: false }],
    projectProposalLineTitle: (line: Row) => (line.name === 'Ceramic' ? 'Solar Window Film — Madico Sunscape Select 15' : 'Structural Silicone'),
    measureAllWindows: () => [{ win: { qty: 1 } }, { win: { qty: 1 } }],
    academyEsc: (v: unknown) => String(v ?? ''),
    fmtDateTime: (v: string) => v,
    render: () => calls.push('render'),
    save: () => calls.push('save'),
    closeModal: () => calls.push('close'),
    changeStatus: (id: string, status: string) => { calls.push(`status:${status}`); order.status = status; return true; },
    alert: (m: string) => calls.push(`alert:${m}`),
    setTimeout: () => 0,
    actSignaturePadInit: () => undefined,
    document: { getElementById: (id: string) => (id === 'act-sign-pad' ? canvas : fields[id] || null) },
  });
  vm.runInContext(slice('function actSignatureWorkLines(o)', 'function actSignaturePadInit()'), c);
  vm.runInContext(slice('function actSignaturePadClear()', 'function openSignedActDocument(oid)'), c);
  return { c, calls, fields, canvas };
}

test('the client signs the act on screen: name, signature, acceptance, then «Акт подписан»', () => {
  const order: Row = { id: 'o', number: 'R-1', status: 'installation_done' };
  const { c, calls, fields, canvas } = signatureContext(order);
  c.openActSignature('o');
  assert.match(c.state.modal, /Certificate of completion · Акт выполненных работ/);
  assert.match(c.state.modal, /Solar Window Film — Madico Sunscape Select 15 — 42 sq ft/);
  assert.match(c.state.modal, /Completed work · 2 windows/);
  assert.match(c.state.modal, /<canvas id="act-sign-pad"/);

  canvas.dataset.strokes = '1';
  c.confirmActSignature('o');
  assert.ok(calls.includes('alert:Попросите клиента расписаться в поле подписи.'));
  assert.equal(order.status, 'installation_done');
  canvas.dataset.strokes = '12';
  fields['act-sign-accept'].checked = false;
  c.confirmActSignature('o');
  assert.ok(calls.some(call => call.startsWith('alert:Клиент должен отметить')));
  fields['act-sign-accept'].checked = true;
  c.confirmActSignature('o');
  assert.equal(order.status, 'act_signed');
  assert.equal(order.actSignature.name, 'Michael Brown');
  assert.equal(order.actSignature.collectedBy, 'u_inst');
  assert.match(order.actSignature.image, /^data:image\/png/);
  assert.equal(order.actSignature.work.length, 2);
  assert.equal(order.timeline[0].key, 'act_signature');
});

test('both the installer and the manager reach the act through the signature; the card shows it', () => {
  const next = slice('function orderPrimaryNextAction(o)', 'function installerOrderPrimaryAction(o)');
  const installer = slice('function installerOrderPrimaryAction(o)', 'function renderOrderActionCard(a)');
  assert.ok(next.includes("onclick: `openActSignature('${o.id}')`"));
  assert.ok(installer.includes("onclick: `openActSignature('${o.id}')`"));
  assert.doesNotMatch(next + installer, /changeStatus\('\$\{o\.id\}','act_signed'\)/);
  assert.match(html, /Акт подписан клиентом: <b>\$\{academyEsc\(o\.actSignature\.name\)\}<\/b>/);
  assert.match(html, /onclick="openSignedActDocument\('\$\{o\.id\}'\)">Открыть акт/);
  assert.match(html, /\.act-signature-pad \{[^}]*touch-action:none/);
});

test('CRM messages open as a CRM card, queue, and survive a reload', () => {
  const store: Record<string, string> = {};
  const body: Row[] = [];
  const makeEl = (): Row => {
    const el: Row = { id: '', className: '', innerHTML: '', remove: () => { const i = body.indexOf(el); if (i >= 0) body.splice(i, 1); }, querySelector: (sel: string) => (sel === '#crm-notice-ok' ? (el.ok ||= { focus() {}, onclick: null }) : (el.text ||= { textContent: '' })) };
    return el;
  };
  const c: any = vm.createContext({
    console,
    sessionStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } },
    document: { getElementById: (id: string) => body.find(el => el.id === id) || null, createElement: () => makeEl(), body: { appendChild: (el: Row) => body.push(el) } },
    setTimeout: (fn: () => void) => fn(),
  });
  vm.runInContext(slice('const CRM_NOTICE_KEY = ', "if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__crmNoticeInstalled)"), c);
  c.crmNotice('Первое');
  c.crmNotice('Второе');
  const layer = body.find(el => el.id === 'crm-notice-layer')!;
  assert.equal(layer.text.textContent, 'Первое');
  assert.match(layer.innerHTML, /ещё 1/);
  assert.deepEqual(JSON.parse(store.rolanpro_pending_notice), ['Первое', 'Второе'], 'kept for a reload');
  c.crmNoticeClose();
  assert.equal(layer.text.textContent, 'Второе');
  c.crmNoticeClose();
  assert.equal(body.length, 0);
  assert.equal(store.rolanpro_pending_notice, undefined);
  assert.match(html, /window\.alert = message => crmNotice\(message\);/);
});

test('the card no longer offers a second way to the measurement', () => {
  assert.doesNotMatch(stages, /title:'Создать или связать замер'/);
});
