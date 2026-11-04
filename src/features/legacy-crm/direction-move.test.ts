import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-11-03: «ошибочно ввёл проект как солнцезащитный, внёс размеры, а
// по факту это защитная — и нет возможности удалить или сменить».
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('the direction window offers to move the direction while the project is open', () => {
  assert.match(fn(stages, 'projectDirectionWindowHtml'), /\$\{edit \? projectDirectionMoveHtml\(o, directionKey\) : ''\}/);
  assert.match(fn(stages, 'projectDirectionMoveHtml'), /Ошиблись направлением\? Перенести/);
  assert.match(fn(stages, 'projectDirectionMoveTargets'), /!service\.general && service\.id !== fromKey && !have\.has\(service\.id\)/, 'only directions not yet in the project');
});

test('moving keeps the measured windows and drops the old direction services and film', () => {
  const move = fn(stages, 'projectDirectionMove');
  assert.match(move, /CLOSED_PROJECT_STATUSES\.includes\(o\.status\)\) return;/);
  assert.match(move, /if \(!confirm\(/);
  assert.match(move, /win\.measureScope = toKey;\s*win\.offeringId = ''; win\.catalogId = ''; win\.filmType = '';/);
  assert.match(move, /o\.serviceTypes = \[\.\.\.new Set\(/);
  assert.match(move, /syncProjectIncludedServices\(o\);/);
  assert.match(move, /key: 'direction_moved'/);
  assert.match(html, /direction_moved: 'Направление проекта изменено'/);
});
