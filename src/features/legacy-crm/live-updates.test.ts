import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { currentReleaseId } from './release';

// Owner, 2026-11-05: «когда мы вносим изменения, у сотрудников на телефонах всё
// обновляется автоматически, без перебоев и зависов».
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const route = readFileSync('app/legacy-crm/route.ts', 'utf8');
const version = readFileSync('app/api/v1/legacy-crm/version/route.ts', 'utf8');
const fn = (name: string) => { const a = html.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return html.slice(a, html.indexOf('\n}\n', a) + 3); };

test('the release id is the commit directory on production and a start stamp in development', () => {
  const id = currentReleaseId();
  assert.ok(/^[0-9a-f]{7,40}$/.test(id) || id.startsWith('dev-'), id);
});

test('the served page carries its release and the version endpoint reports release + workspace revision', () => {
  assert.match(route, /window\.__ROLANPRO_RELEASE__ = \$\{JSON\.stringify\(currentReleaseId\(\)\)\}/);
  assert.match(version, /select: \{ revision: true, updated_at: true \}/, 'no payload is read for the poll');
  assert.match(version, /release: currentReleaseId\(\)/);
  assert.match(version, /requireRequestSession\(request, LEGACY_WORKSPACE_VIEW_ROLES\)/);
});

test('an open CRM polls, pulls newer data without a reload and reloads a new release only when quiet', () => {
  assert.match(html, /setInterval\(cloudCheckForUpdates, 30000\)/);
  assert.match(html, /visibilitychange[\s\S]*cloudCheckForUpdates\(\)/);
  const check = fn('cloudCheckForUpdates');
  assert.match(check, /fetch\('\/api\/v1\/legacy-crm\/version', \{ cache: 'no-store' \}\)/);
  assert.match(check, /Number\(data\.revision\) > cloudRevision && !cloudHasPendingChanges\(\) && !state\.modal\) await cloudPullRemoteChanges\(\)/, 'remote data is pulled only when nothing local is unsaved');
  const pull = fn('cloudPullRemoteChanges');
  assert.match(pull, /mergeCloudWorkspaceSnapshots\(cloudBaseSnapshot, JSON\.parse\(JSON\.stringify\(db\)\), remotePayload\)/, 'the same 3-way merge as a save conflict');
  assert.match(pull, /preservePositionForNextRender\(\);\s*render\(\);/, 'no page reload for data');
  const busy = fn('cloudUserIsBusy');
  assert.match(busy, /!!state\.modal \|\| typing \|\| cloudHasPendingChanges\(\)/);
  const apply = fn('cloudApplyNewRelease');
  assert.match(apply, /if \(cloudUserIsBusy\(\)\)[\s\S]*setTimeout\(cloudApplyNewRelease, 15000\)/, 'a busy user is not interrupted');
  assert.match(apply, /location\.reload\(\)/);
});

// Economics audit (Owner, 2026-11-05): price → direct costs → gross → fixed share → taxes → net.
test('advertising is counted once (in projects) and the tax reserve covers California and federal', () => {
  const burn = fn('companyFixedMonthlyBurn');
  assert.match(burn, /!\['tax', 'marketing'\]\.includes\(item\.category\)/, 'the «Реклама» plan is not in the fixed pool — the ad budget is already allocated per project');
  const profile = fn('projectProfitTaxProfile');
  assert.match(profile, /profile\.federalRatePct = profile\.entityType === 'C_CORP' \? 21 : 0/);
  const profitability = fn('projectProfitability');
  assert.match(profitability, /Number\(profile\.ratePct\) \|\| 0\) \+ Math\.max\(0, Number\(profile\.federalRatePct\) \|\| 0\)\) \/ 100/, 'reserve = profit before tax × (CA + federal), not below the annual minimum');
});

test('the debounced save clears its timer handle, otherwise pending-changes stays true for the whole session', () => {
  const schedule = fn('cloudScheduleSave');
  assert.match(schedule, /cloudSaveTimer = setTimeout\(\(\) => \{ cloudSaveTimer = null; cloudPersist\(\); \}, 700\)/);
  assert.match(fn('cloudPersistConfirmed'), /clearTimeout\(cloudSaveTimer\);\n\s*cloudSaveTimer = null;/);
});
