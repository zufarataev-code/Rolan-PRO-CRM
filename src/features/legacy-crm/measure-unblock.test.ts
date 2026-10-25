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

test('the measurer always works in his studio and can save and leave', () => {
  assert.match(slice(html, 'function openManagerMeasureModal(oid) {', '\n}\n'), /if \(currentUser\(\)\?\.role === 'measurer'\) \{ openEngineeringMeasureStudio\(oid\); return; \}/);
  assert.match(html, /onclick="measureStudioSaveAndExit\('\$\{order\.id\}'\)">Сохранить и выйти<\/button>/);
  assert.match(html, /onclick="measureStudioClose\('\$\{order\.id\}'\)">✕<\/button>/);
  const exit = slice(html, 'function measureStudioSaveAndExit(orderId) {', 'function measureStudioClose(');
  assert.match(exit, /if \(dirty && typed\) \{\s*measureStudioSaveWindow\(orderId\);/, 'the open window is saved first');
  assert.match(exit, /closeModal\(\);/);
  assert.match(html, /photoName: targetWin\.photoName \|\| '', dirty: false \};/);
});

test('the office measurement window has «Сохранить и выйти» in a footer that stays on screen', () => {
  assert.match(html, /onclick="managerMeasureSaveAndExit\('\$\{oid\}'\)">Сохранить и выйти<\/button>/);
  assert.match(html, /\.manager-measure-modal \.manager-measure-footer \{ position:sticky; bottom:0;/);
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
