import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-25: the Services home shows only five directions. A KP option
// remains a normal service and is edited inside its own direction workspace.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('KP options are edited as services inside their direction, not in a global wall', () => {
  const section = fn(html, 'renderServiceOfferingsSection');
  const workspace = fn(html, 'renderServiceDirectionWorkspace');
  const block = fn(html, 'serviceOfferingEditorHtml');
  const pricing = fn(html, 'serviceOfferingPricingEditorHtml');
  assert.doesNotMatch(section, /proposalOptionsSectionHtml|addProposalOption/);
  assert.match(workspace, /serviceOfferingEditorHtml\(selected, owner\)/);
  for (const field of ['name', 'nameEn', 'monthly', 'active']) {
    assert.match(block, new RegExp(`updateServiceOffering\\('\\$\\{offering\\.id\\}','${field}'`), field);
  }
  for (const field of ['pricePerSqft', 'installerRatePerSqft']) assert.match(pricing, new RegExp(`input\\('${field}'`), field);
  assert.match(pricing, /saveServiceOfferingPricing/);
  assert.match(block, /Клиент может добавить как опцию/);
});

test('options are listed across directions; status says when an option is not offered', () => {
  const offerings = [
    { id: 'a', direction: 'solar', name: 'Гарантия', pricePerSqft: 5, monthly: true, proposalOptional: true, unit: 'piece', sort: 0 },
    { id: 'b', direction: 'smart', name: 'Второй пульт', pricePerSqft: 0, proposalOptional: true, unit: 'piece', sort: 1 },
    { id: 'c', direction: 'smart', name: 'Плёнка', pricePerSqft: 20, proposalOptional: true, unit: 'sqft', sort: 0 },
    { id: 'd', direction: 'smart', name: 'Монтаж', pricePerSqft: 9, unit: 'piece', sort: 0 },
  ];
  const ctx: Record<string, unknown> = {
    SERVICE_OFFERING_DIRECTIONS: ['smart', 'solar', 'protective', 'decorative', 'privacy', 'general'],
    serviceOfferingsAll: () => offerings,
    serviceOfferingNeedsSizes: (item: { unit: string }) => item.unit === 'sqft',
  };
  vm.createContext(ctx);
  vm.runInContext(fn(html, 'proposalOptionOfferings') + fn(html, 'proposalOptionStatus'), ctx);
  const list = JSON.parse(vm.runInContext('JSON.stringify(proposalOptionOfferings().map(x => x.id))', ctx));
  assert.deepEqual(list, ['b', 'a']);
  assert.match(vm.runInContext("proposalOptionStatus({ pricePerSqft: 0 }).text", ctx), /Нет цены/);
  assert.match(vm.runInContext("proposalOptionStatus({ pricePerSqft: 5, active: false }).text", ctx), /Выключена/);
  assert.match(vm.runInContext("proposalOptionStatus({ pricePerSqft: 5 }).text", ctx), /В КП/);
});

test('an option without a price never reaches the KP; a direction can be changed', () => {
  assert.match(fn(stages, 'projectProposalOptionalOfferings'), /serviceOfferingIsDraft\(offering\) \|\| !\(Number\(offering\.pricePerSqft\) > 0\) \|\|/);
  const update = fn(html, 'updateServiceOffering');
  assert.match(update, /field === 'direction'/);
  assert.match(update, /offering\.filmIds = \[\];/);
  assert.match(fn(html, 'serviceOfferingIsDraft'), /\['Новая услуга', 'Новая опция'\]/);
});
