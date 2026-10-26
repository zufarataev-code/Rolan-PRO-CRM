import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-25: «Назначить монтаж» opens its own window, cashier-style:
// every project service in order, each with its executors and start/end dates.
// One service can be scheduled now and the rest later; calendar and kanban show
// the project with a labelled colour stripe per service (red film, grey silicone).
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('«Назначить монтаж» opens the install window', () => {
  const scheduler = fn(html, 'scheduleInstallationPrompt');
  assert.match(scheduler, /if \(typeof openInstallWindow === 'function'\) return openInstallWindow\(oid\);/);
  assert.ok(scheduler.indexOf("typeof openInstallWindow") < scheduler.indexOf('ensureProductionReadyForInstallation'), 'the draft planner opens before production gates');
  const win = fn(stages, 'installWindowHtml');
  assert.match(win, /Услуги проекта по порядку/i);
  assert.match(win, /Назначить эту услугу/);
  assert.match(win, /Пока не назначать/);
  assert.match(win, /orderInstallationTechnicalWarnings/);
  assert.match(win, /Монтаж можно назначить/);
  assert.match(win, /Это попадёт в заказ-наряд/);
  assert.match(win, /План можно сохранить уже сейчас/);
  assert.match(win, /Проверить готовность и опубликовать/);
  assert.match(fn(stages, 'installSaveService'), /План монтажа можно сохранять после принятия КП/);
});

test('work kind gives the stripe colour: film red, silicone grey', () => {
  const ctx: any = { serviceOffering: (id: string) => (id === 's' ? { id: 's', unit: 'lft', name: 'Sealant' } : null) };
  vm.createContext(ctx);
  vm.runInContext(fn(stages, 'installWorkKind') + fn(stages, 'installWorkKindMeta'), ctx);
  const kind = (group: any) => vm.runInContext('installWorkKind(g)', Object.assign(ctx, { g: group }));
  assert.equal(kind({ name: 'Ceramic', windows: [{}] }), 'film');
  assert.equal(kind({ name: 'Силикон', windows: [] }), 'silicone');
  assert.equal(kind({ name: 'Блок питания', windows: [] }), 'electric');
  assert.equal(kind({ name: 'Edge', windows: [], lines: [{ offeringId: 's' }] }), 'silicone');
  assert.equal(vm.runInContext("installWorkKindMeta('film').color", ctx), '#DC2626');
  assert.equal(vm.runInContext("installWorkKindMeta('silicone').label", ctx), 'Силикон');
});

test('quick durations: «2 дня» is the start day and the next, 8 working hours', () => {
  const ctx: any = { state: { _installWindow: { draft: { installationAt: '2026-11-02T09:00' } } }, installRerender: () => {} };
  vm.createContext(ctx);
  vm.runInContext(fn(stages, 'installDraftDuration'), ctx);
  const local = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`; };
  vm.runInContext('installDraftDuration(0, 2)', ctx);
  assert.equal(local(ctx.state._installWindow.draft.endsAt), '11/3 17:00');
  vm.runInContext('installDraftDuration(4, 0)', ctx);
  assert.equal(local(ctx.state._installWindow.draft.endsAt), '11/2 13:00');
});

test('a multi-day service shows on every day of the calendar, labelled', () => {
  const cal = fn(stages, 'calendarEventsForOrder');
  assert.match(cal, /service: \{ name: group\.name, kind, end, day: index \+ 1, days: days\.length \}/);
  assert.match(fn(html, 'renderCalendarEventCard'), /calendar-service-stripe/);
  assert.match(fn(html, 'renderCalendarEventCard'), /день \$\{/);
});

test('kanban card carries one labelled stripe per service', () => {
  assert.match(html, /\$\{typeof installStripesHtml === 'function' \? installStripesHtml\(o\) : ''\}/);
  const stripes = fn(stages, 'installStripesHtml');
  assert.match(stripes, /class="install-stripe"/);
  assert.match(stripes, /не назначено/);
  assert.match(html, /\.install-stripe \{/);
});

test('one planned service is enough to schedule; closing needs all', () => {
  const ensure = fn(html, 'ensureProjectServicesPlanned');
  assert.match(ensure, /хотя бы одной услуги — остальные можно позже/);
  assert.match(fn(html, 'changeStatus'), /ensureProjectServicesPlanned\(o, \{ all: closesInstallation \}\)/);
  assert.match(html, /const unplannedKeys = new Set\(unplannedNow\.map\(line => line\.key\)\);/);
  assert.match(html, /onclick: `openInstallWindow\('\$\{o\.id\}'\)`/);
});
