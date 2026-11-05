import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-11-03: «панель для быстрого ввода — чтобы менеджер мог внести
// заказ за прошлый месяц: услуга, плёнка, исполнитель, адрес, контакт, откуда
// лид — и сформировать аналитику по услугам, проверить формулы и зарплаты».
// Owner, 2026-11-04: один проект = клиент + любое число услуг («+ услуга»),
// у каждой своя дата, исполнители и расходники; чек проекта считается сам.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('the panel is a view of its own for owner and manager', () => {
  assert.match(html, /\['quickEntry', 'Быстрый ввод', '⚡'\]/);
  assert.match(html, /case 'quickEntry': return renderQuickEntry\(\);/);
  assert.match(fn(stages, 'quickEntryCanUse'), /\['owner', 'manager'\]\.includes/);
});

test('a project holds many services, each with its own date, crew and supplies', () => {
  assert.match(fn(stages, 'quickEntryDefaultForm'), /lines: \[quickEntryNewLine\(keep\)\]/);
  assert.match(fn(stages, 'quickEntryNewLine'), /date: keep\.date \|\| localDateKey\(\)[\s\S]*installers: \[\], hired: '', hiredName: '', supplies: \[\]/);
  assert.match(fn(stages, 'quickEntryAddLine'), /lines\.push\(quickEntryNewLine\(\{ date: last\?\.date, dir: last\?\.dir \}\)\)/, '«+ услуга» keeps the last date and direction');
  assert.match(fn(stages, 'renderQuickEntry'), /onclick="quickEntryAddLine\(\)">\+ Добавить услугу/);
});

test('one project creates real quick lines and closes through the normal fields', () => {
  const commit = fn(stages, 'quickEntryCommit');
  for (const required of ['имя клиента', 'менеджер', 'дата работ', 'услуга`', 'объём (sq ft / шт)', 'сумма клиенту', 'хотя бы один исполнитель или наёмный']) assert.ok(commit.includes(required), required);
  assert.match(commit, /quickProjectLine: true/);
  assert.match(commit, /startDate: date, endDate: date, installerIds: installers/, 'each line keeps its own date and crew');
  assert.match(commit, /supplyItems: \(src\.supplies \|\| \[\]\)/, 'supplies become the line supply items the warehouse already knows');
  assert.match(commit, /type: 'subcontractor'/, 'a hired specialist is a direct project expense');
  assert.match(commit, /serviceTypes: dirs/);
  assert.match(commit, /leadSource: f\.source/);
  assert.match(commit, /projectQuickSyncProjectInstallers\(o\)/, 'line installers become project installers, so payroll sees them');
  assert.match(commit, /quickEntryComplete\(o, \{ date: lastDate, paid, method/);
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
  const calc = fn(stages, 'quickEntryLineCalc');
  assert.match(calc, /installerRateForQuickLine\(null, ref\)/, 'line preview uses the service rate');
  assert.match(calc, /installerSeniorFactor\(u\)/);
  assert.match(calc, /warehouseCatalogCostPerSqft\(catalogId\)/);
});

test('the panel re-renders without losing typed values', () => {
  assert.match(fn(stages, 'quickEntrySetLine'), /quickEntryReadForm\(\)/);
  const read = fn(stages, 'quickEntryReadForm');
  assert.match(read, /data-qe-installer\]\[data-qe-line=/);
  assert.match(read, /qe-l\$\{i\}-s\$\{j\}-supplyId/);
});

test('material belongs to the service, as in the cashier: default film and package parts follow the chosen service', () => {
  assert.match(fn(stages, 'quickEntrySetLine'), /line\.film = offering \? serviceOfferingDefaultFilmId\(offering\) \|\| '' : '';/);
  const films = fn(stages, 'quickEntryFilmsFor');
  assert.match(films, /if \(!offering\) return \[\];/, 'no service — no film list');
  assert.match(films, /serviceOfferingAllowedFilmIds\(offering\)/);
  const commit = fn(stages, 'quickEntryCommit');
  assert.match(commit, /serviceOfferingIncludes\(offering\)\.forEach\(child => \{[\s\S]*part\.includedBy = offering\.id; part\.unitPrice = 0; part\.price = 0;/, 'A1 brings its silicone as a package line');
  assert.match(commit, /if \(included\.has\(offering\.id\)\) return;/, 'the package part is added once per service, not per line');
});
