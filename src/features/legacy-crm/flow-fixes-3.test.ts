import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Third batch from the Owner's end-to-end user test, 2026-10-23: one
// confirmation for all measured windows, calculation numbers that mean one
// thing each, warnings before closing work early or without photos, and a
// lower measurement header.

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;

function slice(from: string, to: string) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return html.slice(start, end);
}

test('«Подтвердить все размеры» uses the CRM modal, saves immediately and leaves windows without sizes', async () => {
  const windows: Row[] = [
    { id: 'a', name: 'Окно 1', width: 1828.8, height: 1524, qty: 1, measurementSource: 'CUSTOMER' },
    { id: 'b', name: 'Окно 2', width: 914.4, height: 1219.2, qty: 2, measurementSource: 'CUSTOMER' },
    { id: 'c', name: 'Окно 3', width: 1016, height: 1778, qty: 1, measurementSource: 'CUSTOMER', sizePlaceholder: { width: true, height: true } },
    { id: 'd', name: 'Окно 4', width: 900, height: 900, qty: 1, measurementSource: 'SURVEYOR_VERIFIED' },
  ];
  const order: Row = { id: 'o', measurements: { rooms: [{ id: 'r', name: 'Гостиная', windows }] } };
  const calls: string[] = [];
  const context: any = vm.createContext({
    console,
    db: { settings: { inputUnits: 'inches' } },
    state: { currentUserId: 'u' },
    ROLANPRO_CLOUD: true,
    cloudReady: true,
    getOrder: () => order,
    measureAllWindows: (o: Row) => o.measurements.rooms.flatMap((room: Row) => room.windows.map((win: Row) => ({ room, win }))),
    windowMeasurementIsVerified: (w: Row) => w.measurementSource === 'SURVEYOR_VERIFIED',
    windowSizeEntered: (w: Row) => !(w.sizePlaceholder && (w.sizePlaceholder.width || w.sizePlaceholder.height)),
    measureMmToInput: (mm: number) => Number((mm / 25.4).toFixed(2)),
    markWindowMeasurementVerified: (w: Row) => { w.measurementSource = 'SURVEYOR_VERIFIED'; },
    syncOrderWindowRemovalService: () => undefined,
    invalidateProjectEstimate: () => calls.push('invalidate'),
    save: () => calls.push('save'),
    cloudPersistConfirmed: async () => { calls.push('persist'); return true; },
    cloudScheduleSave: () => calls.push('schedule'),
    refreshManagerMeasureModal: () => calls.push('refresh'),
    academyEsc: (value: unknown) => String(value),
    jsQuote: (value: unknown) => String(value),
    projectPlural: (count: number, one: string, few: string, many: string) => count === 1 ? one : count < 5 ? few : many,
    render: () => undefined,
    alert: (m: string) => calls.push(`alert:${m}`),
  });
  vm.runInContext(slice('function managerConfirmableWindows(o)', 'async function managerConfirmWindowMeasurement(oid, rid, wid)'), context);
  assert.deepEqual(context.managerConfirmableWindows(order).map((x: Row) => x.win.id), ['a', 'b']);
  context.openManagerConfirmAllWindowMeasurements('o');
  assert.match(context.state.modal, /Подтвердить 2 окна/);
  assert.match(context.state.modal, /Окно 1<\/b><span>72 × 60 in · 1 шт\./);
  assert.match(context.state.modal, /Без размеров останутся: 1/);
  assert.match(context.state.modal, /managerConfirmAllWindowMeasurements\('o'\)/);
  await context.managerConfirmAllWindowMeasurements('o');
  assert.deepEqual(windows.map(w => w.measurementSource), ['SURVEYOR_VERIFIED', 'SURVEYOR_VERIFIED', 'CUSTOMER', 'SURVEYOR_VERIFIED']);
  assert.equal(order.timeline.length, 1, 'one history entry, not one per window');
  assert.deepEqual(calls, ['invalidate', 'save', 'persist', 'refresh']);
  assert.match(html, /managerConfirmableWindows\(o\)\.length \? ` <button type="button" class="manager-measure-confirm-all"[^>]*onclick="openManagerConfirmAllWindowMeasurements\('\$\{oid\}'\)">Подтвердить все размеры/);
  assert.doesNotMatch(slice('function openManagerConfirmAllWindowMeasurements(oid)', 'async function managerConfirmAllWindowMeasurements(oid)'), /\bconfirm\s*\(/);
});

test('calculation numbers say what they are; company-wide net profit is a folded estimate', () => {
  const estimate = slice('<div class="project-estimate-kpi"><span>Цена клиенту</span>', '<div class="project-estimate-footer">');
  assert.match(estimate, /Валовая прибыль \/ маржа/);
  assert.match(estimate, /Плёнка с отходом раскроя/);
  assert.match(estimate, /<details class="project-estimate-section project-net-profit"/);
  assert.match(estimate, /Чистая прибыль с долей расходов компании · оценка/);
  assert.match(estimate, /В этом месяце пока один проект\./);
  assert.doesNotMatch(estimate, /<h4>6\. Чистая прибыль проекта<\/h4>/);
  assert.match(slice('function projectLinesTableHtml(o', '\n}\n'), /«Материал» в строках — плёнка по площади окон/);
});

test('closing a service early or without any photo asks first; a signed act is confirmed', () => {
  const context: any = vm.createContext({
    console,
    projectPlannedSchedules: (o: Row) => o.plans,
    fmtDateTime: (v: string) => v.slice(0, 10),
  });
  vm.runInContext(slice('function projectServiceDoneWarnings(o, lines, now = new Date())', 'function projectSetServiceProgress(oid, key, status)'), context);
  const lines = [{ key: 'offering:a', name: 'Ceramic' }];
  const now = new Date(2026, 9, 23, 12);
  const early = context.projectServiceDoneWarnings({ photos: [], plans: [{ id: 'offering:a', installationAt: '2026-10-30T16:00:00Z' }] }, lines, now);
  assert.equal(early.length, 2);
  assert.match(early[0], /нет ни одного фото/);
  assert.match(early[1], /«Ceramic» назначена на 2026-10-30/);
  const ok = context.projectServiceDoneWarnings({ photos: [{}], plans: [{ id: 'offering:a', installationAt: new Date(2026, 9, 23, 9).toISOString() }] }, lines, now);
  assert.deepEqual([...ok], [], 'same day with a photo: no question');
  assert.match(slice('function projectSetServiceProgress(oid, key, status)', 'function projectMarkMyServicesDone('), /status === 'done'[^\n]*projectConfirmServicesDone\(o, \[line\]\)/);
  assert.match(slice('function projectMarkMyServicesDone(oid)', 'function projectCloseFinishedProjects()'), /projectConfirmServicesDone\(o, mine\)/);
  // Since 2026-10-23 the act is signed by the client on screen (openActSignature).
  assert.ok(html.includes("onclick: `openActSignature('${o.id}')`"));
});

test('the measurement header is compact on a laptop', () => {
  const css = slice('/* Compact measurement header', '[id$="-company-block"]');
  assert.match(css, /\.manager-measure-header \{ padding: \.55rem 1rem; \}/);
  assert.match(css, /\.manager-measure-progress-step \{ padding: \.28rem \.5rem;/);
});
