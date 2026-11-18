import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { composeProductionHtml } from './production-ui';

// Owner, 2026-11-17: «Кабинет проекта» is a trial view of the Project card. It
// must show what the working card shows — same lines, same totals, same next
// step — and must stay invisible until the owner turns it on.
const legacy = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const cabinet = readFileSync('private/legacy/project-cabinet.js', 'utf8');
const html = composeProductionHtml(composeProductionHtml(legacy, stages), cabinet);

type Row = Record<string, any>;

function load(order: Row, role = 'owner', flag = '1') {
  const calls: string[] = [];
  const store: Row = flag ? { rp_project_cabinet: flag } : {};
  const statuses = ['new', 'consultation_scheduled', 'measurement_scheduled', 'measurement_done', 'proposal_sent', 'proposal_accepted',
    'installation_scheduled', 'installation_accepted', 'installation_en_route', 'installation_in_progress', 'installation_done',
    'act_signed', 'payment_received', 'completed', 'review_received'].map(key => ({ key }));
  const context: any = vm.createContext({
    console, Math, Number, String, JSON,
    db: { settings: { inputUnits: 'inches' }, orders: [order] },
    state: {},
    STATUSES: statuses,
    localStorage: { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; }, removeItem: (key: string) => { delete store[key]; } },
    currentUser: () => ({ id: 'u1', role }),
    getUser: (id: string) => ({ i1: { name: 'Алан' } } as Row)[id],
    getOrder: (id: string) => (id === order.id ? order : undefined),
    projectLines: (o: Row) => o._lines,
    projectServiceProgress: (o: Row, key: string) => o.serviceProgress?.[key] || { status: 'planned' },
    projectLineDirectionInfo: () => ({ icon: '☀️', title: 'Солнцезащитная' }),
    projectCanMarkService: () => true,
    measureAllWindows: (o: Row) => (o.measurements?.rooms || []).flatMap((room: Row) => (room.windows || []).map((win: Row) => ({ room, win }))),
    windowActualAreaSqft: (win: Row) => Number(win.sqft) || 0,
    windowMeasurementIsVerified: (win: Row) => win.verified === true,
    windowCatalog: () => undefined,
    catalogLabel: (item: Row) => item?.name || '',
    mm_to_inches: (mm: number) => mm / 25.4,
    orderRevenue: () => 1000,
    orderPaidTotal: (o: Row) => (o.payments || []).reduce((sum: number, p: Row) => sum + p.amount, 0),
    orderPrimaryNextAction: () => ({ icon: '👷', title: 'Назначить монтаж', sub: 'Выберите исполнителей', onclick: "openInstallPlan('o1')" }),
    orderAddress: () => '1 Main St',
    orderUserCanManage: (user: Row) => ['owner', 'manager'].includes(user?.role),
    statusLabel: (key: string) => key,
    fmtMoney: (value: number) => `$${Number(value).toFixed(0)}`,
    fmtDate: (value: string) => String(value).slice(0, 10),
    academyEsc: (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ''),
    jsQuote: (value: unknown) => String(value ?? ''),
    uid: () => 'm1',
    save: () => calls.push('save'), render: () => calls.push('render'), preservePositionForNextRender: () => undefined,
  });
  const start = html.indexOf('function projectCabinetEnabled(');
  assert.ok(start > 0, 'cabinet module is composed into the legacy page');
  // The cabinet's functions are appended last, right before the boot anchor.
  vm.runInContext(html.slice(start, html.indexOf('// ---------- BOOT ----------', start)), context);
  return { context, calls };
}

function order(): Row {
  return {
    id: 'o1', number: 'R-1', status: 'proposal_accepted', payments: [{ amount: 400 }],
    _lines: [
      { key: 'a', name: 'MP35', qty: 120, unitShort: 'sq ft', price: 700, installerIds: ['i1'], installationAt: '2026-11-18T09:00' },
      { key: 'b', name: 'Силикон', qty: 40, unitShort: 'ft', price: 300, installerIds: [], installationAt: '' },
    ],
    serviceProgress: { a: { status: 'done' } },
    measurements: { rooms: [{ id: 'r1', name: 'Гостиная', windows: [{ id: 'w1', name: 'Окно 1', width: 1524, height: 2438, qty: 3, sqft: 120, verified: true }, { id: 'w2', name: 'Окно 2', qty: 1, sqft: 0 }] }] },
    photos: [{ id: 'p1', dataUrl: 'data:image/png;base64,AA', roomId: 'r1' }],
  };
}

test('the cabinet is the owner\'s project card by default; other roles keep the working card', () => {
  assert.equal(load(order(), 'owner', '').context.projectCabinetEnabled({ role: 'owner' }), true);
  assert.equal(load(order(), 'owner', '0').context.projectCabinetEnabled({ role: 'owner' }), false, '«Обычная карточка» is remembered on the device');
  assert.equal(load(order(), 'manager', '').context.projectCabinetEnabled({ role: 'manager' }), false);
  assert.equal(load(order(), 'manager', '').context.projectCabinetEntryBar(order(), { role: 'manager' }), '');
  const empty = order(); empty.photos = [];
  const page = load(empty).context.projectCabinetHtml(empty, { name: 'Michael' }, { role: 'owner' }, { canSeeMoney: true, canManage: true });
  assert.ok(page.includes("addOrderPhoto('o1')"), 'a project without photos offers to add one right in the tour');
});

test('stages, services, windows and money come from the working CRM functions', () => {
  const { context } = load(order());
  const model = context.projectCabinetModel(order(), {}, { role: 'owner' }, { canSeeMoney: true });
  assert.deepEqual(JSON.parse(JSON.stringify(model.stages.map((stage: Row) => stage.state))), ['done', 'done', 'done', 'now', 'wait', 'wait']);
  assert.equal(model.workPct, 50);
  assert.equal(model.windowCount, 4);
  assert.equal(model.sizedCount, 3);
  assert.equal(model.revenue, 1000);
  assert.equal(model.paid, 400);
  assert.equal(model.paidPct, 40);
  assert.equal(model.primary.title, 'Назначить монтаж');
});

test('an employee without money access gets no sums in the cabinet', () => {
  const { context } = load(order());
  const model = context.projectCabinetModel(order(), {}, { role: 'owner' }, { canSeeMoney: false });
  assert.equal(model.revenue, 0);
  assert.equal(model.paid, 0);
  const page = context.projectCabinetHtml(order(), { name: 'Michael' }, { role: 'owner' }, { canSeeMoney: false, canManage: true });
  assert.ok(!page.includes('$'));
});

test('the page keeps the working next step and marks a window on a photo', () => {
  const o = order();
  const { context, calls } = load(o);
  const page = context.projectCabinetHtml(o, { name: 'Michael' }, { role: 'owner' }, { canSeeMoney: true, canManage: true });
  assert.ok(page.includes("openInstallPlan('o1')"));
  assert.ok(page.includes('$400'));
  context.projectCabinetPickWindow('r1|w1');
  context.projectCabinetPhotoTap({ clientX: 150, clientY: 50, currentTarget: { getBoundingClientRect: () => ({ left: 100, top: 0, width: 200, height: 100 }) } }, 'o1', 'p1');
  assert.deepEqual(JSON.parse(JSON.stringify(o.photos[0].marks)), [{ id: 'm1', roomId: 'r1', windowId: 'w1', x: 25, y: 50 }]);
  assert.ok(calls.includes('save'));
  // A second tap moves the point instead of adding another one.
  context.projectCabinetPickWindow('r1|w1');
  context.projectCabinetPhotoTap({ clientX: 200, clientY: 50, currentTarget: { getBoundingClientRect: () => ({ left: 100, top: 0, width: 200, height: 100 }) } }, 'o1', 'p1');
  assert.equal(o.photos[0].marks.length, 1);
  assert.equal(o.photos[0].marks[0].x, 50);
});
