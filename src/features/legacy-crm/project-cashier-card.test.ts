import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-26: «раздел проект очень запутан — сделать понятным, как касса».
// The opened project keeps the feed order but reads as the cashier: four direction
// tiles on top, rooms as tiles, one receipt with the total and the next button.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('the four directions are always on the card, filled when in the project', () => {
  assert.match(stages, /const PROJECT_CASHIER_DIRECTION_ORDER = \['smart_film', 'solar_film', 'protective_film', 'decorative_film'\];/);
  const map = fn(stages, 'projectCashierMapHtml');
  assert.match(map, /class="project-cashier-direction on \$\{excluded \? 'excluded' : ''\}"/);
  assert.match(map, /if \(!\(money && edit\)\) return '';/, 'field roles see no add tiles');
  assert.match(map, /<div class="project-cashier-directions four">\$\{tiles\}<\/div>/);
  assert.match(html, /\.project-cashier-directions\.four \{ grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(html, /\.project-cashier-directions\.four \.project-cashier-direction\.on \{ background:var\(--direction-color\); color:#fff; \}/);
});

test('rooms are tiles that open the one measurement window and say базовый or полный', () => {
  const feed = fn(stages, 'projectFeedHtml');
  assert.match(feed, /class="project-room-tile \$\{full \? 'full' : ''\}" onclick="\$\{measureAction\}"/);
  assert.match(feed, /const full = rw\.length && rw\.every\(win => !win\.quickMeasure\);/);
  assert.match(feed, /\$\{rw\.length \? \(full \? 'полный ✓' : 'базовый'\) : 'без окон'\}/);
  assert.match(feed, /class="project-room-tile add" onclick="\$\{measureAction\}"/);
  assert.match(html, /\.project-room-tiles \{ display:grid;/);
});

test('the receipt shows the total with one next button, only for money roles', () => {
  const feed = fn(stages, 'projectFeedHtml');
  assert.match(feed, /\$\{money && \(lines\.length \|\| projectPendingSizedServices\(o\)\.length\) \? projectFeedCheckHtml\(o, lines, proposal\) : ''\}/);
  const check = fn(stages, 'projectFeedCheckHtml');
  assert.match(check, /projectFeedBtn\(proposal \? 'Открыть КП' : 'Собрать КП', `openProposalWizard\('\$\{o\.id\}'\)`, 'primary'\)/);
  assert.match(check, /projectFeedBtn\('Монтаж', "projectCardOpenWorkspace\('schedule'\)", 'primary'\)/);
  assert.match(check, /fmtMoney\(orderRevenue\(o\)\)/);
  assert.match(html, /@media \(max-width:720px\) \{ \.project-feed-check \{ position:sticky; bottom:8px;/);
});
