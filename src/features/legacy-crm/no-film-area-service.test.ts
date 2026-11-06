import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepareServiceSolutions } from './service-solutions';

// Owner, 2026-11-06 (тест формул на 5 проектах): «Силикон» за кв. фут нельзя
// было закрыть — CRM требовала плёнку у любой услуги по площади. Силикон,
// мойка и удаление плёнки считаются по площади, но плёнки у них нет.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('a per-sq-ft service may be marked «без плёнки» and then needs no film to close', () => {
  assert.match(fn(html, 'serviceOfferingNoFilm'), /offering\?\.noFilm === true/);
  assert.match(fn(html, 'projectLineUsesFilm'), /line\?\.noFilm !== true/);
  const issues = fn(html, 'projectQuickCompletionIssues');
  assert.match(issues, /projectLineUsesFilm\(line\) && !line\.catalogId && !projectQuickManualFilmName\(line\)\)\) issues\.push\('не выбрана плёнка'\)/);
  assert.match(issues, /projectLineUsesFilm\(line\) && !line\.catalogId && projectQuickManualFilmName\(line\)/);
  assert.match(fn(stages, 'quickEntryBuildLine'), /\.\.\.\(noFilm \? \{ noFilm: true \} : \{\}\)/, 'the line remembers that it carries no film');
  assert.match(fn(stages, 'quickEntryCommit'), /!serviceOfferingNoFilm\(offering\) && !line\.film\) problems\.push/);
});

test('the service editor offers the flag and such a service may be sold in every direction', () => {
  assert.match(html, /updateServiceOffering\('\$\{offering\.id\}','noFilm',this\.checked,this\)/);
  assert.match(fn(html, 'serviceOfferingDirections'), /\(!serviceOfferingNeedsSizes\(offering\) \|\| serviceOfferingNoFilm\(offering\)\)/);
  assert.match(fn(html, 'toggleServiceOfferingDirection'), /serviceOfferingNeedsSizes\(offering\) && !serviceOfferingNoFilm\(offering\)\) \{ if \(control\)/);
});

test('server validation accepts the flag only for a per-sq-ft service without linked films', () => {
  const check = (patch: Record<string, unknown>) => prepareServiceSolutions({ settings: {} }, { settings: { serviceOfferings: [{ id: 'svc_sil', name: 'Силикон', direction: 'protective', unit: 'sqft', pricePerSqft: 3, installerRatePerSqft: 0, ...patch }], catalog: [{ id: 'f1', category: 'protective' }] } }, true);
  assert.equal(check({ noFilm: true, directions: ['smart', 'solar'] }), null);
  assert.match(String(check({ directions: ['smart'] })), /только в своём направлении/);
  assert.match(String(check({ noFilm: 'yes' })), /да\/нет/);
  assert.match(String(check({ noFilm: true, unit: 'piece' })), /только для услуги за кв\. фут/);
  assert.match(String(check({ noFilm: true, filmIds: ['f1'] })), /не может быть привязанных плёнок/);
});
