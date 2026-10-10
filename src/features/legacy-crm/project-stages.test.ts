import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-10: the next step of a project follows its services. A
// project without services gets them first; one whose services need no sizes
// (or already have them) goes to its estimate and proposal, skipping
// consultation and measurement; field measurement offers this project's
// directions only.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;
const slice = (from: string, to: string) => {
  const start = html.indexOf(from);
  assert.ok(start >= 0, from);
  const end = html.indexOf(to, start + from.length);
  assert.ok(end > start, to);
  return html.slice(start, end);
};

function load(project: Row) {
  const context: any = vm.createContext({
    Math, Set,
    projectLines: (o: Row) => o.lines || [],
    projectPendingSizedServices: (o: Row) => o.pending || [],
    orderMeasurementCompletionIssues: (o: Row) => o.issues || [],
    orderNeedsMeasurements: (o: Row) => !!o.needsSizes,
    projectEstimateIsApproved: (o: Row) => !!o.approved,
    getOrderStatus: (o: Row) => ({ step: ({ new: 0, consultation_scheduled: 1, measurement_scheduled: 2, measurement_done: 2, proposal_sent: 3 } as Row)[o.status] ?? 0 }),
    T: (key: string) => key,
    orderMeasureScopes: (o: Row) => o.scopes || [],
    orderMeasureScope: (o: Row) => o.primaryScope || 'solar_film',
    measureScopeCardDesc: () => '',
    academyEsc: (value: unknown) => String(value ?? ''),
    MEASURE_SCOPES: ['solar_film', 'smart_film', 'protective_film', 'decorative_film', 'privacy_film'].map(key => ({ key, short: key, icon: '', accent: '#000' })),
  });
  vm.runInContext(slice('function projectHasServices(o) {', 'function orderPrimaryNextAction(o) {'), context);
  vm.runInContext(slice('function renderOrderCleanProgress(o) {', 'function clientSocialHandle('), context);
  vm.runInContext(slice('function orderKanbanNextStatus(status) {', 'function orderKanbanAdvance('), context);
  vm.runInContext(slice('function measureStudioHasChosenServices(order) {', 'function openEngineeringMeasureStudio('), context);
  return { c: context, o: project };
}

test('the next step follows the services: add them, then estimate and proposal when no measurement is needed', () => {
  const none = load({ id: 'o', status: 'new' });
  assert.equal(none.c.projectServicesNextAction(none.o).title, 'Добавить услуги проекта');
  const sizeFree = { id: 'o', status: 'new', offeringIds: ['zone'], lines: [{ kind: 'quantity' }] };
  const { c } = load(sizeFree);
  const step = c.projectServicesNextAction(sizeFree);
  assert.equal(step.title, 'Рассчитать проект');
  assert.match(step.sub, /Замер не нужен/);
  assert.equal(step.onclick, "openProjectEstimateWorkspace('o')");
  assert.equal(c.projectServicesNextAction({ ...sizeFree, approved: true }).title, 'Сформировать КП');
  // A measured project whose windows are complete goes to its estimate even before the status moved.
  assert.match(c.projectServicesNextAction({ ...sizeFree, needsSizes: true, status: 'measurement_scheduled' }).sub, /Замер готов/);
  // A per-sq-ft service without sizes keeps the usual consultation and measurement.
  assert.equal(c.projectServicesNextAction({ id: 'o', status: 'new', offeringIds: ['a1'], pending: [{ id: 'a1' }], needsSizes: true, issues: ['добавьте окна'] }), null);
  // The incoming request alone is not work: after its last line was deleted the project asks for services again.
  assert.equal(c.projectServicesNextAction({ id: 'o', status: 'new', offeringId: 'zone', offeringIds: ['zone'], lines: [] }).title, 'Добавить услуги проекта');
  // After the proposal the usual steps apply.
  assert.equal(c.projectServicesNextAction({ ...sizeFree, status: 'proposal_sent' }), null);
  const primary = slice('function orderPrimaryNextAction(o) {', 'function installerOrderPrimaryAction(');
  assert.match(primary, /const byServices = projectServicesNextAction\(o\);\n  if \(byServices\) return byServices;\n  if \(o\.status === 'new'\)/);
});

test('the stage bar marks a measurement the services do not need as skipped', () => {
  const sizeFree = { id: 'o', status: 'new', offeringIds: ['zone'], lines: [{ kind: 'quantity' }] };
  const { c } = load(sizeFree);
  const bar = c.renderOrderCleanProgress(sizeFree);
  assert.match(bar, /order-clean-progress-step skipped">[\s\S]*?stepConsultation · не нужен/);
  assert.match(bar, /order-clean-progress-step skipped">[\s\S]*?stepMeasurement · не нужен/);
  assert.match(bar, /order-clean-progress-step current">[\s\S]*?stepProposal/);
  const sized = { id: 'o', status: 'new', offeringIds: ['a1'], pending: [{ id: 'a1' }], needsSizes: true, issues: ['добавьте окна'] };
  assert.doesNotMatch(c.renderOrderCleanProgress(sized), /не нужен/);
});

test('the kanban arrow skips consultation and measurement for a settled project', () => {
  const sizeFree = { id: 'o', status: 'new', offeringIds: ['zone'], lines: [{ kind: 'quantity' }] };
  const { c } = load(sizeFree);
  assert.equal(c.projectKanbanNextStatus(sizeFree), 'proposal_sent');
  assert.equal(c.projectKanbanNextStatus({ id: 'o', status: 'new', offeringIds: ['a1'], pending: [{ id: 'a1' }], needsSizes: true, issues: ['добавьте окна'] }), 'consultation_scheduled');
  assert.equal(c.projectKanbanNextStatus({ ...sizeFree, status: 'proposal_sent' }), 'proposal_accepted');
  assert.match(html, /const next = projectKanbanNextStatus\(o\);\n  const projectAddress = orderAddress\(o, c\);/, 'the card shows the same next stage');
});

test('field measurement offers the directions of this project\'s services', () => {
  const project = { id: 'o', status: 'new', offeringIds: ['a1'], scopes: ['protective_film'] };
  const { c } = load(project);
  const own = c.measureStudioScopeButtons('protective_film', project);
  assert.match(own, /data-measure-scope="protective_film"/);
  assert.doesNotMatch(own, /data-measure-scope="solar_film"|data-measure-scope="smart_film"/);
  const legacy = c.measureStudioScopeButtons('solar_film', { id: 'l', status: 'new' });
  assert.equal((legacy.match(/data-measure-scope=/g) || []).length, 5, 'a project without chosen services still offers every direction');
  assert.match(html, /\$\{measureStudioScopeButtons\(scopeKey, order\)\}/);
});

test('field measurement starts in a direction that needs sizes, not the size-free first service', () => {
  // The first service is a smart zone (no sizes); the protective film needs them.
  const project = { id: 'o', status: 'new', offeringId: 'zone', offeringIds: ['zone', 'a1'], primaryScope: 'smart_film', scopes: ['protective_film'] };
  const { c } = load(project);
  assert.equal(c.measureStudioDefaultScope(project), 'protective_film');
  const buttons = c.measureStudioScopeButtons('protective_film', project);
  assert.doesNotMatch(buttons, /data-measure-scope="smart_film"/, 'the size-free direction is not offered');
  // A window already measured in another direction keeps it visible.
  const withWindow = { ...project, measurements: { rooms: [{ windows: [{ measureScope: 'solar_film' }] }] } };
  assert.match(c.measureStudioScopeButtons('protective_film', withWindow), /data-measure-scope="solar_film"/);
  assert.equal(c.measureStudioDefaultScope({ id: 'l', status: 'new', primaryScope: 'solar_film' }), 'solar_film');
  assert.match(html, /const scopeKey = win\?\.measureScope \|\| measureStudioDefaultScope\(order\);/);
});

test('a project whose services all need no sizes does not open field measurement; a new window keeps a measurable direction', () => {
  const sizeFree = { id: 'o', status: 'new', offeringId: 'zone', offeringIds: ['zone'], primaryScope: 'smart_film', scopes: [] };
  const { c } = load(sizeFree);
  assert.equal((c.measureStudioScopeButtons('smart_film', sizeFree).match(/data-measure-scope=/g) || []).length, 0, 'no direction to measure');
  const studio = slice('function openEngineeringMeasureStudio(orderId) {', 'order.measurements = order.measurements || { rooms: [] };\n  const first');
  assert.match(studio, /if \(measureStudioHasChosenServices\(order\) && !measureStudioProjectScopes\(order\)\.length && !measureAllWindows\(order\)\.length\) \{\n    alert\('Замер не нужен/);
  const newWindow = slice('function measureStudioNewWindow(orderId) {', '\n}\n');
  assert.match(newWindow, /const defaultScope = measureStudioDefaultScope\(order\);/);
});

