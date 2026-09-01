import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');

test('warehouse separates stock, procurement, suppliers and movement journal', () => {
  assert.match(html, /Склад и снабжение/);
  assert.match(html, /Закупки/);
  assert.match(html, /Поставщики/);
  assert.match(html, /Журнал прихода и списания/);
});

test('purchase requests require an assignee and can link to a project', () => {
  assert.match(html, /Назначьте ответственного за закупку/);
  assert.match(html, /orderId:document\.getElementById\('pr-order'\)/);
  assert.match(html, /responsibleId/);
  assert.match(html, /purchaseRequestId/);
});

test('warehouse movements reject negative stock and support QR labels', () => {
  assert.match(html, /Недостаточно на складе/);
  assert.match(html, /Недостаточно плёнки/);
  assert.match(html, /RP-ROLL-/);
  assert.match(html, /RP-SUP-/);
  assert.match(html, /openWarehouseQr/);
});

test('film warehouse opens categories before models and rolls', () => {
  assert.match(html, /function renderFilmCategoryDirectory\(\)/);
  assert.match(html, /Плёнка по категориям/);
  assert.match(html, /function openFilmWarehouseCategory\(category\)/);
  assert.match(html, /function renderFilmCategoryModels\(category\)/);
  assert.match(html, /Выберите модель, чтобы увидеть её рулоны/);
  assert.match(html, /function renderFilmModelStock\(catalogId\)/);
  assert.match(html, /if \(!category\) return renderFilmCategoryDirectory\(\);/);
  assert.match(html, /if \(model\) return renderFilmModelStock\(model\);/);
});

test('film category navigation reuses existing catalog and inventory records', () => {
  assert.match(html, /function filmWarehouseRolls\(catalogId\)[\s\S]*?db\.inventory/);
  assert.match(html, /function renderFilmCategoryModels\(category\)[\s\S]*?db\.settings\.catalog/);
  assert.match(html, /state\.inventoryFilmCategory=film\?\.category\|\|null;state\.inventoryFilmModel=roll\.catalogId\|\|null/);
});
