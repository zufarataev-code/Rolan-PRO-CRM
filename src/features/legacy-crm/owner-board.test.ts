import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { composeProductionHtml } from './production-ui';

// Owner, 2026-11-17: «заливай в нашу CRM эту админку» — the demo board on live
// data. It must count with the working CRM functions, write nothing, and stay
// invisible until the owner turns it on.
const legacy = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const html = [readFileSync('private/legacy/production-stages.js', 'utf8'), readFileSync('private/legacy/project-cabinet.js', 'utf8'), readFileSync('private/legacy/owner-board.js', 'utf8')]
  .reduce((page, module) => composeProductionHtml(page, module), legacy);

type Row = Record<string, any>;

function load(orders: Row[], flag = '1') {
  const calls: string[] = [];
  const store: Row = flag ? { rp_owner_board: flag } : {};
  const funnel = [
    { id: 'lead', title: 'Новые', statuses: ['new'], color: '#1' },
    { id: 'proposal', title: 'КП', statuses: ['proposal_sent', 'proposal_accepted'], color: '#2' },
    { id: 'install', title: 'Монтаж', statuses: ['installation_scheduled', 'installation_done'], color: '#3' },
    { id: 'payment', title: 'Акт / оплата', statuses: ['act_signed', 'payment_received'], color: '#4' },
    { id: 'done', title: 'Закрыто', statuses: ['completed', 'review_received'], color: '#5' },
  ];
  const context: any = vm.createContext({
    console, Math, Number, String, Map,
    ORDER_KANBAN_FUNNEL: funnel,
    localStorage: { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; }, removeItem: (key: string) => { delete store[key]; } },
    visibleOrdersForUser: () => orders,
    orderKanbanRevenue: (o: Row) => o.revenue,
    orderPaidTotal: (o: Row) => o.paidTotal || 0,
    projectLines: (o: Row) => o.lines || [],
    projectServiceProgress: (o: Row, key: string) => ({ status: o.done?.includes(key) ? 'done' : 'planned' }),
    projectLineDirectionInfo: (line: Row) => ({ title: line.dir }),
    pulseBusinessSnapshot: () => ({ revenue: 900, bars: [{ label: '1 нояб', value: 400 }, { label: '8 нояб', value: 500 }] }),
    getClient: () => ({ name: 'Michael' }),
    renderManagerDashboard: () => '<section class="pulse-dashboard"></section>',
    fmtMoney: (value: number) => `$${Number(value).toFixed(0)}`,
    academyEsc: (value: unknown) => String(value ?? ''),
    jsQuote: (value: unknown) => String(value ?? ''),
    save: () => calls.push('save'), render: () => calls.push('render'),
  });
  const cabinet = html.indexOf('function projectCabinetRing(');
  const css = html.indexOf('function projectCabinetCss(');
  const ui = html.indexOf('function projectCabinetUi(');
  vm.runInContext(html.slice(cabinet, ui), context);
  assert.ok(css > cabinet);
  const start = html.indexOf('function ownerBoardEnabled(');
  assert.ok(start > 0, 'board module is composed into the legacy page');
  // The board's functions are appended last, right before the boot anchor.
  vm.runInContext(html.slice(start, html.indexOf('// ---------- BOOT ----------', start)), context);
  return { context, calls };
}

const orders = (): Row[] => [
  { id: 'a', number: 'R-1', status: 'new', revenue: 1000, lines: [{ key: 'x', dir: 'Солнцезащитная', price: 1000 }] },
  { id: 'b', number: 'R-2', status: 'installation_done', revenue: 3000, paidTotal: 1500, lines: [{ key: 'x', dir: 'Смарт', price: 2500 }, { key: 'y', dir: 'Солнцезащитная', price: 500 }], done: ['x'] },
  { id: 'c', number: 'R-3', status: 'completed', revenue: 9000, paidTotal: 9000, lines: [{ key: 'x', dir: 'Смарт', price: 9000 }], done: ['x'] },
  { id: 'd', number: 'R-4', status: 'new', revenue: 500, quickEntryDraft: true },
];

test('the board is the owner\'s own choice; otherwise «Пульс бизнеса» is untouched', () => {
  const on = load(orders(), '1').context;
  const off = load(orders(), '').context;
  assert.equal(on.ownerBoardEnabled({ role: 'owner' }), true);
  assert.equal(on.ownerBoardEnabled({ role: 'manager' }), false);
  assert.equal(off.ownerBoardEnabled({ role: 'owner' }), false);
  assert.match(off.ownerBoardScreen({ role: 'owner' }), /Пульт владельца \(проба\)[\s\S]*pulse-dashboard/);
  assert.equal(off.ownerBoardScreen({ role: 'manager' }), '<section class="pulse-dashboard"></section>');
  assert.match(on.ownerBoardScreen({ role: 'owner' }), /Воронка проектов/);
});

test('sums, stages and directions come from active projects and the working functions', () => {
  const { context, calls } = load(orders());
  const model = context.ownerBoardModel({ role: 'owner' });
  assert.equal(model.activeCount, 2, 'closed projects and quick-entry drafts are not active');
  assert.equal(model.activeRevenue, 4000);
  assert.equal(model.activePaid, 1500);
  assert.equal(model.awaiting, 1500);
  assert.equal(model.reachedCount, 1);
  assert.equal(model.lineTotal, 3);
  assert.equal(model.lineDone, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(model.directionRows.map((row: Row) => [row.title, row.sum]))), [['Смарт', 2500], ['Солнцезащитная', 1500]]);
  assert.deepEqual(JSON.parse(JSON.stringify(model.columns.map((column: Row) => [column.id, column.count, column.sum]))), [['lead', 1, 1000], ['proposal', 0, 0], ['install', 1, 3000], ['payment', 0, 0]]);
  const page = context.ownerBoardHtml({ role: 'owner' });
  assert.ok(page.includes("openOrder('b')"));
  assert.ok(page.includes('$900'), 'the month total is the one «Пульс бизнеса» shows');
  assert.deepEqual(calls, [], 'the board writes nothing');
});
