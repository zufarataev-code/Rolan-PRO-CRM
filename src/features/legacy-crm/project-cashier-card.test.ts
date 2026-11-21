import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-26: «раздел проект очень запутан — сделать понятным, как касса».
// The opened project keeps the feed order but reads as the cashier: five direction
// tiles on top, rooms as tiles, one receipt with the total and the next button.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('only the directions in the project are cards; one small «+ Направление / услуга» opens the picker (#577)', () => {
  const map = fn(stages, 'projectCashierMapHtml');
  assert.match(map, /const directionOrder = \['smart_film', 'solar_film', 'protective_film', 'decorative_film', 'privacy_film'\];/);
  assert.match(map, /directionOrder\.map\(key =>/);
  assert.match(map, /class="project-cashier-direction on \$\{excluded \? 'excluded' : ''\}"/);
  assert.match(map, /if \(!\(money && edit\)\) return '';/, 'field roles see no add button');
  // Owner, 2026-11-10: a direction already in the project is not repeated as a tile.
  assert.doesNotMatch(map, /count-\$\{Math\.min\(active, 4\)\}">\$\{tiles\}/, 'no duplicate tile above the direction card');
  // Owner, 2026-11-21 (#577): «пять больших плиток не нужны, одна маленькая кнопка».
  assert.doesNotMatch(map, /project-cashier-directions four/, 'no five big direction tiles in an empty project');
  assert.doesNotMatch(map, /class="project-cashier-direction add"/);
  assert.match(map, /onclick="openProjectDirectionPicker\('\$\{o\.id\}'\)">\+ Направление \/ услуга<\/button>/);
  assert.match(map, /<span class="project-cashier-empty">В проекте пока нет услуг<\/span>/);
  // A project made from a lead offers the lead's direction first, «из заявки».
  // Codex review on #590: only a real lead (canonicalLeadId or the lead → project stamp)
  // gets «из заявки»; «пусто» counts every direction, general works included.
  assert.match(map, /const empty = !directions\.length;/);
  assert.match(map, /const fromLead = !o\.quickEntry && \(Boolean\(o\.canonicalLeadId\) \|\| \['from_lead', 'auto_from_ad'\]\.includes\(o\.leadIntentConfidence\)\);/);
  assert.match(map, /const leadKey = fromLead \? String\(o\.leadIntentServiceType \|\| ''\) : '';/);
  assert.match(map, /const leadService = empty && money && edit && directionOrder\.includes\(leadKey\)/);
  assert.match(map, /const emptyHtml = empty \?/);
  assert.match(html, /leadIntentConfidence: note \|\| 'captured'/);
  assert.match(html, /orderDirectionFields\(leadDirection\.id, silent \? 'auto_from_ad' : 'from_lead'\)/);
  assert.match(map, /class="project-cashier-lead" onclick="openProjectDirectionWindow\('\$\{o\.id\}','\$\{jsQuote\(leadKey\)\}','services'\)"/);
  assert.match(map, /из заявки\$\{leadSource/);
  assert.match(fn(stages, 'projectCashierToggleAdd'), /state\.projectCashierAdding = /);
  assert.doesNotMatch(html, /\.project-cashier-direction\.add \{ grid-column: 1 \/ -1/, 'no full-width empty tiles');
  assert.match(html, /\.project-cashier-add-row\.compact \{ display:flex;/);
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
  assert.match(html, /@media \(max-width:720px\) \{ \.project-feed-check \{ display:flex; position:sticky; bottom:8px;/);
  assert.match(html, /\.project-feed-check \{ display:none;/, 'desktop does not repeat the total from the project header');
});
