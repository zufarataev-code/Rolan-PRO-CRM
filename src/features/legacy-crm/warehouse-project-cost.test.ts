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

test('quick project cost is derived from priced warehouse stock and employee rates', () => {
  assert.match(html, /function warehouseCatalogStockStats\(catalogId\)/);
  assert.match(html, /stats\.remainingValue \+= lotCost \* remainingM \/ originalM/);
  assert.match(html, /function warehouseCatalogCostPerSqft\(catalogId\)/);
  assert.match(html, /function projectQuickRequiredSqftByCatalog\(o\)/);
  assert.match(html, /demand\[line\.catalogId\] = \(demand\[line\.catalogId\] \|\| 0\) \+ requiredSqft/);
  assert.match(html, /function orderQuickLineMaterialCost\(o\)/);
  assert.match(html, /sqftWithWaste \* warehouseCatalogCostPerSqft\(line\.catalogId\)/);
  assert.match(html, /if \(!measureAllWindows\(o\)\.length\) return orderQuickLineMaterialCost\(o\)/);
  assert.match(html, /function installerRateForQuickLine\(user, line\)/);
  assert.match(html, /pc\.ratesByCategory\?\.\[category\]/);
  assert.match(html, /return orderQuickInstallerPayoutForUser\(o, user, installerIds\.length\)/);
  assert.match(html, /filter\(x => !x\.quickProjectLine\)/);
});

test('project estimate does not ask for manual marketing spend', () => {
  const start = html.indexOf('function renderProjectEstimateWorkspace');
  const end = html.indexOf('function openProjectEstimateWorkspace', start);
  const workspace = html.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(workspace, /projectEstimateUpdateSetting\([^\n]+['"]marketing['"]/);
  assert.match(html, /const marketing = rev \* Math\.max\(0, Number\(pd\.marketingPct\) \|\| 0\) \/ 100/);
  assert.match(html, /Рекламный резерв/);
});
