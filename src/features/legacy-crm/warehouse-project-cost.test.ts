import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

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
  assert.match(html, /function warehouseCatalogCostPerSqft\(catalogId, allowHistoricalEvidence = false\)/);
  assert.match(html, /if \(!allowHistoricalEvidence\) return 0/);
  assert.match(html, /const history = inventoryByCatalogId\(catalogId\)\.reduce/, 'a fully consumed historical roll retains its purchase-cost evidence');
  assert.match(html, /getCatalogItem\(catalogId\)\?\.costPerSqft/, 'catalog cost is the final historical fallback');
  assert.match(html, /function projectQuickRequiredSqftByCatalog\(o, lines = projectQuickLines\(o\)\)/);
  assert.match(html, /demand\[line\.catalogId\] = \(demand\[line\.catalogId\] \|\| 0\) \+ requiredSqft/);
  assert.match(html, /function orderQuickLineMaterialCost\(o\)/);
  assert.match(html, /sqftWithWaste \* warehouseCatalogCostPerSqft\(line\.catalogId, o\?\.quickEntry === true\)/);
  assert.match(html, /if \(!measureAllWindows\(o\)\.length\) return orderQuickLineMaterialCost\(o\)/);
  // One rates directory (2026-10-24): the service rate, no personal overrides.
  assert.match(html, /function installerRateForQuickLine\(_user, line\)/);
  assert.doesNotMatch(html, /pc\.ratesByCategory\?\.\[category\]/);
  assert.match(html, /const filmPayout = !measureAllWindows\(o\)\.length \? orderQuickInstallerPayoutForUser\(o, user\)/);
  assert.match(html, /filter\(line => line\.unit === 'sqft' && \(line\.installerIds \|\| \[\]\)\.includes\(user\?\.id\)\)/);
  assert.match(html, /new Set\(line\.installerIds \|\| \[\]\)\.size/);
  assert.match(html, /return \(filmPayout \+ orderAdditionalWorkPayoutForUser\(o, user, installerIds\.length\)\) \* installerSeniorFactor\(user\)/);
  assert.match(html, /filter\(line => !line\.quickProjectLine\)/);
});

test('depleted historical roll costs never price unknown stock in a current project', () => {
  const start = html.indexOf('function warehouseCatalogCostPerSqft(');
  const source = html.slice(start, html.indexOf('\n}', start) + 3);
  const context: any = vm.createContext({
    warehouseCatalogStockStats: () => ({ pricedSqft: 0, remainingValue: 0 }),
    inventoryByCatalogId: () => [{ originalLengthM: 30, widthMm: 1000, costTotal: 600 }],
    mm2_to_sqft: (value: number) => value / 1_000_000 * 10.7639,
    getCatalogItem: () => ({ costPerSqft: 2 }),
  });
  vm.runInContext(`${source}; current = warehouseCatalogCostPerSqft('film'); historical = warehouseCatalogCostPerSqft('film', true);`, context);
  assert.equal(context.current, 0);
  assert.ok(context.historical > 0);
});

test('project estimate does not ask for manual marketing spend', () => {
  const start = html.indexOf('function renderProjectEstimateWorkspace');
  const end = html.indexOf('function openProjectEstimateWorkspace', start);
  const workspace = html.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(workspace, /projectEstimateUpdateSetting\([^\n]+['"]marketing['"]/);
  assert.match(html, /const marketing = orderAdAllocation\(o\)/);
  assert.match(html, /Реклама — доля бюджета месяца/);
});
