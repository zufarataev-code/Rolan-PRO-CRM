import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-24: «замерщик элементарно не может закончить замер… выйти не
// может, просто сохранить»; «окно добавить плёнку выведено по умолчанию, а логика
// — при выборе плёнки, если нет на складе, добавить самому и сформировать заказ
// на закупку»; «услугу из выпадающего списка можно добавить, но она не
// добавляется в проект, не считается»; «теги дублируют услуги».

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');

function slice(src: string, from: string, to: string) {
  const start = src.indexOf(from);
  const end = src.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return src.slice(start, end);
}

test('one measurement window for every role: next window, save and back, the measurer hands in without a film', () => {
  assert.doesNotMatch(slice(html, 'function openManagerMeasureModal(oid) {', '\n}\n'), /openEngineeringMeasureStudio/);
  assert.match(slice(html, 'function openMeasurerV25ForOrder(oid) {', '\n}\n'), /openManagerMeasureModal\(oid\);/);
  // Owner, 2026-10-24: one button in the footer, not five.
  const footer = slice(html, 'function managerMeasureFooterActionHtml(o) {', '\n}\n');
  assert.match(footer, /'✓ Сдать замер' : '✓ Замер готов — рассчитать'/);
  assert.match(footer, /onclick="managerMeasureSaveAndExit\('\$\{oid\}'\)">Готово<\/button>/);
  assert.match(html, /\$\{managerMeasureFooterActionHtml\(o\)\}/);
  assert.doesNotMatch(html, />Сохранить и назад<\/button>|>Сохранить и следующее окно<\/button>/);
  const done = slice(html, 'function completeManagerMeasurement(oid) {', '\n}\n');
  assert.match(done, /orderWorkflowTransitionIssues\(o, 'measurement_done'\), \.\.\.orderTechnicalMeasurementIssues\(o\)/);
  assert.match(done, /box\.innerHTML = `<b>Чтобы сдать замер:<\/b>/);
  assert.match(html, /\.manager-measure-modal \.manager-measure-footer \{ position:sticky; bottom:0;/);
});

test('the film list of a window: in stock first, then the service films to order', () => {
  assert.match(html, /<optgroup label="На складе">/);
  assert.match(html, /<optgroup label="Нет на складе — под заказ">/);
});

test('film: the room block is folded; a missing film is added from the window list and ordered', () => {
  assert.match(html, /<details class="manager-room-film-disclosure">\n\s*<summary><span>🎞 Одна плёнка на всю комнату/);
  assert.match(html, /<option value="__manual">➕ Нет в списке — добавить плёнку и заказать…<\/option>/);
  assert.match(html, /if \(field === 'catalogId' && value === '__manual'\) \{ openWindowManualFilmForm\(oid, rid, wid, inMeasurement\); return; \}/);
  const save = slice(stages, 'function saveWindowManualFilm(', '\n}\n');
  assert.match(save, /pendingPurchase: true/);
  assert.match(save, /offering\.filmIds = \[\.\.\.new Set\(\[\.\.\.serviceOfferingFilmIds\(offering\), catalog\.id\]\)\]/);
  assert.match(save, /createManualFilmDraft\(o, catalog, sqft \|\| 1, \{ widthMm, vendorId, note \}\)/, 'a purchase request is drafted');
});

test('a per-sq-ft service added to a measured project goes on chosen windows instead of waiting at $0', () => {
  const commit = slice(html, 'function serviceCashierCommit() {', 'function serviceCashierCardStyle(');
  assert.match(commit, /openOfferingWindowsPicker\(oid, offering\.id,/);
  const saveWin = slice(stages, 'function saveOfferingWindows(', '\n}\n');
  assert.match(saveWin, /applyWindowOffering\(win, offering\);/);
  assert.match(html, /onclick="openOfferingWindowsPicker\('\$\{o\.id\}','\$\{jsQuote\(offering\.id\)\}'\)">Выбрать окна<\/button>/);
});

test('one price and sq ft everywhere: the list and reports use the project revenue', () => {
  assert.match(html, /function orderPrice\(o\) \{ return orderRevenue\(o\); \}/);
  assert.match(html, /\$\{area \? area\.toFixed\(1\) \+ ' sq ft' : '—'\}/);
});
