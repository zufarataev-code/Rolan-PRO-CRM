import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-11-05: «плёнка привязывается к услуге как материал — правильно,
// но силикон к услуге "Силикон" привязать нельзя; у каждой услуги должны быть
// свои расходники со склада». A service carries supply norms per unit; they
// give its material cost and the supply rows of a project line.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

const supplies = [{ id: 'sup_sil', name: 'Силикон', unit: 'pcs', costPerUnit: 8, qty: 20 }];
const context: any = vm.createContext({
  ensureSupplies: () => supplies,
  uid: (() => { let n = 0; return () => 'u' + (++n); })(),
});
vm.runInContext([
  fn(html, 'serviceOfferingSupplies'), fn(html, 'serviceOfferingHasSupplies'), fn(html, 'serviceOfferingSupplyCostPerUnit'), fn(html, 'serviceOfferingSupplyItemsFor'),
].join('\n'), context);

test('a service norm prices one unit from the warehouse supply', () => {
  const offering = { id: 'svc', supplies: [{ id: 'oss1', supplyId: 'sup_sil', qtyPerUnit: 0.04 }] };
  const cost = vm.runInContext('serviceOfferingSupplyCostPerUnit(' + JSON.stringify(offering) + ')', context);
  assert.equal(Math.round(cost * 1000) / 1000, 0.32, '0.04 tube × $8');
  assert.equal(vm.runInContext('serviceOfferingHasSupplies(' + JSON.stringify(offering) + ')', context), true);
  assert.equal(vm.runInContext('serviceOfferingHasSupplies({ supplies: [{ supplyId: "missing", qtyPerUnit: 1 }] })', context), false, 'a deleted supply gives no norm');
});

test('project supply rows follow the quantity and keep manual rows', () => {
  const offering = { id: 'svc', supplies: [{ id: 'oss1', supplyId: 'sup_sil', qtyPerUnit: 0.04 }] };
  const rows = vm.runInContext('serviceOfferingSupplyItemsFor(' + JSON.stringify(offering) + ', 50, [{ id: "m1", supplyId: "sup_sil", qty: 1 }, { id: "a0", supplyId: "sup_sil", qty: 9, auto: true }])', context);
  assert.equal(JSON.stringify(rows.map((r: any) => [r.supplyId, r.qty, !!r.auto])), JSON.stringify([['sup_sil', 2, true], ['sup_sil', 1, false]]), 'norm × qty replaces old auto rows, the manual row stays');
});

test('the norm replaces the hand-typed material figure in the directory and in project economics', () => {
  const cost = fn(html, 'serviceOfferingMaterialCost');
  assert.match(cost, /serviceOfferingHasSupplies\(offering\) && line\?\.offeringMaterialCost == null\) return serviceOfferingSupplyCostPerUnit\(offering\)/);
  assert.match(fn(html, 'projectOfferingLine'), /serviceOfferingHasSupplies\(offering\) \? serviceOfferingSupplyCostPerUnit\(offering\) : Number\(offering\.materialCostPerUnit\)/, 'the owner snapshot carries the norm cost');
  assert.match(fn(html, 'serviceOfferingPricingMetrics'), /serviceOfferingHasSupplies\(offering\) \? serviceOfferingSupplyCostPerUnit\(offering\)/);
  assert.match(fn(html, 'serviceOfferingPricingEditorHtml'), /из расходников/, 'the price book shows the computed material instead of an input');
  assert.match(fn(html, 'serviceOfferingEditorHtml'), /serviceOfferingSuppliesEditorHtml\(offering\)/, 'norms are edited in «Состав услуги»');
});

test('project and quick-entry lines get the norm rows for film services', () => {
  const updater = fn(html, 'projectEstimateUpdateQuickLine');
  assert.match(updater, /if \(offering\) line\.supplyItems = serviceOfferingSupplyItemsFor\(offering, line\.qty, line\.supplyItems\);/);
  assert.match(updater, /field === 'qty' && line\.quickProjectLine && \(line\.supplyItems \|\| \[\]\)\.some\(item => item\.auto\)/, 'quantity changes re-apply the norm without touching manual rows');
  const setLine = fn(stages, 'quickEntrySetLine');
  assert.match(setLine, /if \(offering && serviceOfferingNeedsSizes\(offering\)\) \{\s*line\.supplies = serviceOfferingSupplyItemsFor\(offering, line\.qty, line\.supplies\)/);
  assert.match(fn(stages, 'quickEntryBuildLine'), /\.\.\.\(item\.auto \? \{ auto: true \} : \{\}\)/, 'the auto flag survives into the project line');
});
