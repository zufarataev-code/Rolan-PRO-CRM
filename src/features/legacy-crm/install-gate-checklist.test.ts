import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-26: «не могу начать монтаж, вечно что-то блокирует». The card
// now shows one checklist «до монтажа осталось: ①②③» and gives the owner a
// «Начать монтаж всё равно» button that records a risk and bypasses the gates.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('the checklist lists the four steps before installation and hides once scheduled', () => {
  const steps = fn(stages, 'projectInstallGateSteps');
  for (const t of ['Услуги и замер добавлены', 'КП собрано и принято клиентом', 'Аванс получен', 'Точные размеры подтверждены']) assert.ok(steps.includes(t), t);
  const list = fn(stages, 'projectCardGateChecklist');
  assert.match(list, /PROJECT_SCHEDULED_STATUSES\.includes\(o\.status\) \|\| CLOSED_PROJECT_STATUSES\.includes\(o\.status\)/);
  assert.match(list, /const left = steps\.filter\(step => !step\.done\)\.length;/);
  assert.match(list, /if \(!left\) return '';/, 'when everything is ready the normal install button shows, not the checklist');
  // Only the first unfinished step is the active one; the rest wait.
  assert.match(list, /if \(!activeMarked\) \{ cls = 'todo'; activeMarked = true; \} else cls = 'wait';/);
  // The checklist renders only for money roles, placed before the services block.
  const feed = fn(stages, 'projectFeedHtml');
  assert.match(feed, /\$\{money \? projectCardGateChecklist\(o, \{ canManage, owner: u\?\.role === 'owner' \}\) : ''\}/);
});

test('only the owner gets «Начать монтаж всё равно», and it records a risk and bypasses the gates', () => {
  const list = fn(stages, 'projectCardGateChecklist');
  assert.match(list, /owner\s*\?\s*`<div class="gate-owner"><button[^>]*onclick="projectForceInstallation\('\$\{o\.id\}'\)">Начать монтаж всё равно →/);
  assert.match(list, /o\.installationForced\s*\?/, 'once forced, the button is replaced by a risk note');
  const force = fn(stages, 'projectForceInstallation');
  assert.match(force, /currentUser\(\)\?\.role !== 'owner'/, 'owner only');
  assert.match(force, /if \(!confirm\(/, 'asks before forcing');
  assert.match(force, /o\.installationForced = \{ at: /);
  assert.match(force, /key: 'installation_forced'/);
  assert.match(force, /scheduleInstallationPrompt\(oid\)/);
  // Both installation gates honour the owner's force flag.
  assert.match(html, /if \(o\.installationForced\) return true;[\s\S]{0,120}orderMeasurementVerificationIssues/);
  assert.match(html, /function ensureProductionReadyForInstallation\(o\) \{\n  if \(o\.installationForced\) return true;/);
  assert.match(html, /installation_forced: 'Монтаж начат без полной готовности/);
});
