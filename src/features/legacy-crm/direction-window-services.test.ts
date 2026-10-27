import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-25: «понятный механизм разделения услуг: выбираешь направление —
// открывается отдельное окно, и уже в нём добавляешь и удаляешь лишнее».
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('the card shows one tile per direction; before production its lines open the window', () => {
  const card = fn(stages, 'renderProjectCardServices');
  assert.match(card, /class="project-direction-tile" onclick="\$\{open\}"/);
  assert.match(card, /\$\{production \? directionLines\.map\(row\)\.join\(''\) \+ direction\.pending\.map\(pendingRow\)\.join\(''\) : directionLines\.map\(compactRow\)/);
  assert.doesNotMatch(card, /projectDirectionOfferingPickerHtml\(o,direction\.key\)/, 'no second add button on the card');
  assert.doesNotMatch(card, /> В расчёте<\/label>/, 'the include switch lives in the window');
  // Owner, 2026-10-26: the card opens on the four direction tiles of the cashier;
  // a direction not in the project is a tinted «+ добавить» tile that opens its window.
  const map = fn(stages, 'projectCashierMapHtml');
  assert.match(map, /PROJECT_CASHIER_DIRECTION_ORDER\.map\(key =>/);
  assert.match(map, /class="project-cashier-direction add"[^>]*onclick="openProjectDirectionWindow\('\$\{o\.id\}','\$\{jsQuote\(key\)\}','services'\)"/);
  assert.match(map, /<span>\+ добавить<\/span>/);
  assert.doesNotMatch(map, /openProjectDirectionPicker/, 'no picker between the tile and the window');
  assert.doesNotMatch(map, /project-cashier-flow-actions/, 'the three duplicate buttons are gone');
});

test('in the window every service has ✕, the include switch and the add list', () => {
  const win = fn(stages, 'projectDirectionWindowHtml');
  assert.match(win, /projectDirectionRemoveLine\('\$\{o\.id\}','\$\{jsQuote\(directionKey\)\}','\$\{jsQuote\(line\.key\)\}'\)/);
  assert.match(win, /projectDirectionRemovePending\(/);
  assert.match(win, /Направление входит в расчёт и КП/);
  assert.match(win, /\$\{edit \? projectDirectionAddHtml\(o, directionKey\) : ''\}/);
  assert.match(fn(stages, 'projectDirectionRemoveLine'), /openProjectDirectionWindow\(oid, directionKey, 'services'\);/, 'stays in the window');
});

test('package parts, quick lines and finished work have no ✕', () => {
  const ctx: any = { projectServiceProgress: (_: unknown, key: string) => ({ status: key === 'done' ? 'done' : 'planned' }) };
  vm.createContext(ctx);
  vm.runInContext(fn(stages, 'projectDirectionLineRemovable'), ctx);
  const can = (line: any) => vm.runInContext('projectDirectionLineRemovable({}, line)', Object.assign(ctx, { line }));
  assert.equal(can({ key: 'a', kind: 'quantity', sources: [{ id: 's1' }] }), true);
  assert.equal(can({ key: 'b', kind: 'windows', offeringId: 'svc' }), true);
  assert.equal(can({ key: 'c', kind: 'included', sources: [{ id: 's2', includedBy: 'x' }] }), false);
  assert.equal(can({ key: 'q', kind: 'quick' }), false);
  assert.equal(can({ key: 'done', kind: 'quantity', sources: [{ id: 's3' }] }), false);
  assert.equal(can({ key: 'p', kind: 'quantity', sources: [{ id: 's4', includedBy: 'pkg' }] }), false);
});

test('removing a measured service keeps the sizes and frees the windows', () => {
  const remove = fn(stages, 'projectDirectionRemoveLine');
  assert.match(remove, /if \(win\.offeringId === line\.offeringId\) \{ win\.offeringId = ''; win\.catalogId = ''; \}/);
  assert.match(remove, /Размеры \$\{count\} \$\{projectWindowsWord\(count\)\} останутся в замере/);
  assert.match(html, /\.project-direction-tile \{/);
});
