import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-25: «когда назначается монтаж или консультация, обязательно
// нужно указать время». Date and time are separate fields; nothing is saved and
// no time is guessed until both are chosen.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

function readWith(values: Record<string, string>) {
  const marks: string[] = [];
  const el = (id: string) => (id in values ? { value: values[id], classList: { add: () => marks.push(id), remove: () => {} }, focus: () => {} } : null);
  const box: any = { hidden: true, textContent: '' };
  const ctx: any = { document: { getElementById: (id: string) => (id.endsWith('-error') ? box : el(id)) }, alert: () => {} };
  vm.createContext(ctx);
  vm.runInContext(fn(stages, 'scheduleReadDateTime'), ctx);
  return { at: vm.runInContext("scheduleReadDateTime('csch', 'консультации')", ctx), box, marks };
}

test('a date without a time is refused with a clear message', () => {
  const r = readWith({ 'csch-date': '2026-11-03', 'csch-time': '' });
  assert.equal(r.at, null);
  assert.equal(r.box.textContent, 'Укажите время консультации.');
  assert.equal(r.box.hidden, false);
  assert.deepEqual(r.marks, ['csch-time']);
  assert.equal(readWith({ 'csch-date': '', 'csch-time': '' }).box.textContent, 'Укажите дату и время консультации.');
});

test('date and time together give the moment', () => {
  const r = readWith({ 'csch-date': '2026-11-03', 'csch-time': '14:00' });
  const d = new Date(r.at);
  assert.equal(`${d.getDate()} ${d.getHours()}:${d.getMinutes()}`, '3 14:0');
});

test('consultation and measurement modals use the required date + time fields and stop without them', () => {
  assert.match(fn(html, 'scheduleConsultationPrompt'), /scheduleDateTimeHtml\('csch', o\?\.consultationAt/);
  assert.match(fn(html, 'confirmScheduleConsultation'), /const at = scheduleReadDateTime\('csch', 'консультации'\);\n {2}if \(!at\) return;/);
  assert.match(fn(html, 'scheduleMeasurementPrompt'), /scheduleDateTimeHtml\('msch', o\?\.measurementAt/);
  assert.match(fn(html, 'confirmScheduleMeasurement'), /const at = scheduleReadDateTime\('msch', 'замера'\);\n {2}if \(!at\) return;/);
  assert.doesNotMatch(html, /id="csch-dt"|id="msch-dt"/);
});

test('moving a project to consultation/measurement without a time opens the booking', () => {
  const cs = fn(html, 'changeStatus');
  assert.match(cs, /newStatus === 'consultation_scheduled' && !o\.consultationAt[^\n]*scheduleConsultationPrompt\(o\.id\); return false;/);
  assert.match(cs, /newStatus === 'measurement_scheduled' && !o\.measurementAt[^\n]*scheduleMeasurementPrompt\(o\.id\); return false;/);
});

test('install window: separate date and time, no guessed start', () => {
  assert.match(fn(stages, 'installWindowHtml'), /\$\{installDateTimeHtml\(d\)\}/);
  assert.match(fn(stages, 'installDateTimeHtml'), /Выберите время начала/);
  assert.match(fn(stages, 'installDraftDuration'), /if \(!d\.installationAt\) return alert\('Сначала укажите дату и время начала\.'\);/);
  assert.doesNotMatch(fn(stages, 'installDraftDuration'), /setHours\(9/);
  const ctx: any = { state: { _installWindow: { draft: { installationAt: '', endsAt: '' } } }, installRerender: () => {} };
  vm.createContext(ctx);
  vm.runInContext(fn(stages, 'scheduleLocalParts') + fn(stages, 'installDraftSet') + fn(stages, 'installDraftPart'), ctx);
  vm.runInContext("installDraftPart('start','date','2026-11-02')", ctx);
  assert.equal(ctx.state._installWindow.draft.installationAt, '', 'date alone is not a start');
  vm.runInContext("installDraftPart('start','time','10:00')", ctx);
  const start = new Date(ctx.state._installWindow.draft.installationAt);
  assert.equal(start.getHours(), 10);
  assert.equal(new Date(ctx.state._installWindow.draft.endsAt).getHours(), 18, 'end defaults to +8h');
});
