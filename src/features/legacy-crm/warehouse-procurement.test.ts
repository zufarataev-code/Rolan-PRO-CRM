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
