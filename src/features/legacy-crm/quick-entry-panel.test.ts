import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-11-03: «панель для быстрого ввода — чтобы менеджер мог внести
// заказ за прошлый месяц: услуга, плёнка, исполнитель, адрес, контакт, откуда
// лид — и сформировать аналитику по услугам, проверить формулы и зарплаты».
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('the panel is a view of its own for owner and manager', () => {
  assert.match(html, /\['quickEntry', 'Быстрый ввод', '⚡'\]/);
  assert.match(html, /case 'quickEntry': return renderQuickEntry\(\);/);
  assert.match(fn(stages, 'quickEntryCanUse'), /\['owner', 'manager'\]\.includes/);
});

test('one row creates a real project with a quick line and closes it through the normal fields', () => {
  const commit = fn(stages, 'quickEntryCommit');
  for (const required of ['дата работ', 'имя клиента', 'услуга', 'объём (sq ft / шт)', 'сумма клиенту', 'хотя бы один исполнитель', 'менеджер']) assert.ok(commit.includes(required), required);
  assert.match(commit, /quickProjectLine: true/);
  assert.match(commit, /leadSource: f\.source/);
  assert.match(commit, /projectQuickSyncProjectInstallers\(o\)/, 'line installers become project installers, so payroll sees them');
  assert.match(commit, /quickEntryComplete\(o, \{ date, paid, method/);
  const complete = fn(stages, 'quickEntryComplete');
  assert.match(complete, /o\.status = full \? 'completed' : 'act_signed'/, 'partial payment leaves the project awaiting payment');
  assert.match(complete, /projectEstimateApprovalSnapshot\(o, recordedAt, true\)/);
});

test('rates come only from the directories: the panel reads orderPSS and calcUserPayoutForPeriod', () => {
  const econ = fn(stages, 'quickEntryEconomics');
  assert.match(econ, /const pss = orderPSS\(o\);/);
  assert.doesNotMatch(econ, /commissionPct\s*\*|installerRatePerSqft\s*\*/, 'no formulas of its own');
  assert.match(econ, /монтажникам насчитано \$0/);
  assert.match(econ, /цена ниже коридора/);
  assert.match(fn(stages, 'quickEntryPeople'), /calcUserPayoutForPeriod\(u\.id, start, end\)/);
});

test('the panel re-renders without losing typed values', () => {
  assert.match(fn(stages, 'quickEntrySet'), /quickEntryReadForm\(\)/);
  assert.match(fn(stages, 'quickEntryReadForm'), /data-qe-installer/);
});
