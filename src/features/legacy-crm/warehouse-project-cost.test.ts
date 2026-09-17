import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');

test('project material cost uses warehouse lot purchase cost with catalog fallback', () => {
  assert.match(html, /function filmInventoryMaterialCost\(catalogId, usage, catalogCostPerSqft = 0\)/);
  assert.match(html, /takeM \* lotCost \/ originalM/);
  assert.match(html, /mm2_to_sqft\(requirement\.width \* outstandingM \* 1000\) \* catalogCostPerSqft/);
  assert.match(html, /filmInventoryMaterialCost\(id, usage\[id\], Number\(cat\.costPerSqft\) \|\| 0\)/);
});

test('project estimate does not ask for manual marketing spend', () => {
  const start = html.indexOf('function renderProjectEstimateWorkspace');
  const end = html.indexOf('function openProjectEstimateWorkspace', start);
  const workspace = html.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(workspace, /projectEstimateUpdateSetting\([^\n]+['"]marketing['"]/);
  assert.match(html, /const marketing = 0;/);
});
