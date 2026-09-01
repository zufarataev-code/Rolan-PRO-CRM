import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const seed = readFileSync('prisma/seed.ts', 'utf8');

test('warehouse separates stock, procurement, suppliers and movement journal', () => {
  assert.match(html, /Склад и снабжение/);
  assert.match(html, /Закупки/);
  assert.match(html, /Поставщики/);
  assert.match(html, /Журнал прихода и списания/);
});

test('purchase requests require an assignee and can link to a project', () => {
  assert.match(html, /Назначьте ответственного за закупку/);
  assert.match(html, /const orderId=document\.getElementById\('pr-order'\)/);
  assert.match(html, /responsibleId/);
  assert.match(html, /purchaseRequestId/);
});

test('manager can create a project purchase request from a film shortage', () => {
  assert.match(html, /function openProjectFilmPurchaseRequest\(orderId, catalogId\)/);
  assert.match(html, /Создать заявку на закупку/);
  assert.match(html, /projectFilmShortageSnapshot\(orderId, catalogId\)/);
  assert.match(html, /activeProjectFilmPurchaseRequest\(orderId,itemId\)/);
  assert.match(html, /order\.purchaseRequestIds=Array\.from\(new Set/);
  assert.match(html, /key:'purchase_requested'/);
  assert.match(html, /Allocate the widest cuts first and consume each real roll only once/);
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

test('Magnitronic Solar Prime series is seeded with verified meter readings', () => {
  for (const model of ['SP-5%', 'SP-15%', 'SP-20%', 'SP-35%', 'SP-50%', 'SP-70%']) {
    assert.match(html, new RegExp(model.replace('%', '%')));
    assert.match(seed, new RegExp(model.replace('%', '%')));
  }
  assert.match(html, /'SP05': \{ vlt: 5\.7,\s+tser: 93\.3, uv: 100\.0, ir: 95\.6 \}/);
  assert.match(html, /'SP70': \{ vlt: 68\.0, tser: 63\.6, uv: 99\.2,\s+ir: 99\.4 \}/);
  assert.match(html, /ensureMagnitronicSolarPrimeSeries\(s\.catalog\);/);
  assert.match(html, /brand: 'Rolan PRO'/);
  assert.match(html, /series: 'Magnitronic Solar Prime'/);
  assert.match(seed, /"ROLANPRO", "Rolan PRO", "Rolan PRO"/);
  assert.match(seed, /"Magnitronic Solar Prime SP-5%", "Magnitronic Solar Prime SP-5%"/);
  assert.match(html, /retailPerSqft: null/);
  assert.match(html, /costPerSqft: null/);
});
