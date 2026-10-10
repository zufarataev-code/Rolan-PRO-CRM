import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');

test('project intake follows client, object, services and responsibility', () => {
  const start = html.indexOf('function openOrderModal()');
  const modal = html.slice(start, html.indexOf('function refreshOrderIntakeGates()', start));
  const anchors = ['id="no-client-search"', 'id="no-site-type-buttons"', 'id="no-offerings"', 'id="no-mgr"'];
  let previous = -1;
  for (const anchor of anchors) {
    const next = modal.indexOf(anchor);
    assert.ok(next > previous, anchor);
    previous = next;
  }
  assert.doesNotMatch(modal, /id="no-svc-buttons"/);
  assert.match(modal, /<input type="hidden" id="no-svc" value="">/);
  assert.match(modal, /state\._newOrderService = ''/);
  assert.match(modal, /state\._newOrderOfferingId = ''/);
  assert.match(modal, /renderNewOrderOfferings\(\); refreshOrderIntakeGates\(\);/);
});

function loadIntake(offerings: any[]) {
  const state: any = { _newOrderOfferingId: '', _newOrderExtraOfferingIds: [], _newOrderMaterialsByService: {}, _newOrderSiteType: '', _newOrderClient: '' };
  const nodes = new Map<string, any>();
  for (const id of ['no-svc', 'no-offerings', 'no-offering-empty', 'no-site-type']) nodes.set(id, { value: '', style: {}, innerHTML: '' });
  const blocks = ['data-intake-site', 'data-intake-client', 'data-intake-offering', 'data-new-order-after-client'];
  const gates = new Map(blocks.map(name => [`[${name}]`, [{ style: { display: '' } }]]));
  const directions = [{ id: 'solar_film', title: 'Solar' }, { id: 'smart_film', title: 'Smart' }];
  const context: any = vm.createContext({
    state,
    db: { settings: { catalog: [] } },
    Set,
    ORDER_PRIMARY_SERVICES: directions,
    document: {
      querySelector: () => null,
      getElementById: (id: string) => nodes.get(id),
      querySelectorAll: (key: string) => gates.get(key) || [],
    },
    serviceOffering: (id: string) => offerings.find(offering => offering.id === id),
    serviceOfferingDirection: (id: string) => id.split('_')[0],
    serviceOfferingsFor: (direction: string) => offerings.filter(offering => offering.direction === direction && offering.active !== false),
    serviceOfferingIncludes: () => [],
    serviceOfferingFilmIds: () => [],
    getCatalogItem: () => null,
    warehouseCatalogStockStats: () => ({ availableSqft: 0 }),
    normalizeOrderSiteType: (value: string) => ['COMMERCIAL', 'RESIDENTIAL'].includes(value) ? value : '',
    academyEsc: (value: string) => value,
    refreshOrderBuilderPreview: () => undefined,
    requestAnimationFrame: () => undefined,
    serviceOfferingNeedsSizes: (offering: any) => !offering?.unit || offering.unit === 'sqft',
    serviceOfferingUnitShort: (offering: any) => offering?.unit || 'sq ft',
  });
  vm.runInContext(html.slice(html.indexOf('function offeringServiceType('), html.indexOf('function selectOrderExecution(')), context);
  return { context, state, nodes, gates };
}

test('services of several directions are ticked; the first is the incoming request; inactive ones are refused', () => {
  const offerings = [
    { id: 'solar', name: 'Solar solution', direction: 'solar' },
    { id: 'smart', name: 'Smart solution', direction: 'smart', unit: 'piece' },
    { id: 'inactive', name: 'Old', direction: 'smart', active: false },
  ];
  const { context, state, nodes, gates } = loadIntake(offerings);
  context.renderNewOrderOfferings();
  assert.match(nodes.get('no-offerings').innerHTML, /Solar solution/);
  assert.match(nodes.get('no-offerings').innerHTML, /Smart solution/);
  assert.doesNotMatch(nodes.get('no-offerings').innerHTML, /Old/);
  context.refreshOrderIntakeGates();
  assert.equal(gates.get('[data-intake-site]')![0].style.display, 'none');

  state._newOrderClient = 'client';
  context.refreshOrderIntakeGates();
  assert.equal(gates.get('[data-intake-site]')![0].style.display, '');
  assert.equal(gates.get('[data-intake-offering]')![0].style.display, 'none');

  context.selectOrderSiteType('RESIDENTIAL');
  assert.equal(gates.get('[data-intake-offering]')![0].style.display, '');

  context.toggleNewOrderOffering('smart', true);
  context.toggleNewOrderOffering('solar', true);
  assert.equal(state._newOrderOfferingId, 'smart');
  assert.deepEqual([...state._newOrderExtraOfferingIds], ['solar']);
  assert.equal(state._newOrderService, 'smart_film');
  assert.equal(nodes.get('no-svc').value, 'smart_film');
  assert.equal(gates.get('[data-new-order-after-client]')![0].style.display, '');

  context.toggleNewOrderOffering('inactive', true);
  assert.deepEqual([state._newOrderOfferingId, ...state._newOrderExtraOfferingIds], ['smart', 'solar']);

  context.toggleNewOrderOffering('smart', false);
  assert.equal(state._newOrderOfferingId, 'solar');
  assert.equal(state._newOrderService, 'solar_film');

  context.toggleNewOrderOffering('solar', false);
  assert.equal(state._newOrderOfferingId, '');
  assert.equal(gates.get('[data-new-order-after-client]')![0].style.display, 'none');
});

test('saved project keeps the chosen services for measurement, estimate and proposal', () => {
  const creation = html.slice(html.indexOf('function createOrder(nextStep'), html.indexOf('function openClientModal()'));
  assert.match(creation, /const serviceId = offeringServiceType\(selectedOfferings\[0\]\);/);
  assert.match(creation, /offeringId: offering\.id/);
  assert.match(creation, /offeringCatalogIds/);
  assert.match(creation, /offering\.direction !== serviceOfferingDirection\(service\.id\)/);
  assert.doesNotMatch(creation, /openManagerMeasureModal/);
  const defaults = html.slice(html.indexOf('function managerWindowDefaults('), html.indexOf('function syncWindowPanelsForType('));
  assert.match(defaults, /o\.offeringIds \|\| o\.orderBuilder\?\.offeringIds/);
  assert.match(defaults, /\.map\(serviceOffering\)\.find/);
  assert.match(defaults, /applyWindowOffering\(win, offering\)/);
  assert.match(defaults, /projectOfferingCatalogId\(o, activeOffering\?\.id\)/);
});

test('multiple concrete services are deduplicated and inactive or unknown directions cannot enter intake', () => {
  const offerings = [{ id: 'a', direction: 'solar' }, { id: 'b', direction: 'solar' }, { id: 'c', direction: 'smart' }, { id: 'off', direction: 'smart', active: false }, { id: 'unknown', direction: 'unknown' }];
  const state: any = { _newOrderOfferingId: 'a', _newOrderExtraOfferingIds: ['a', 'b', 'c', 'c', 'off', 'unknown'] };
  const context: any = vm.createContext({ state, Set, ORDER_PRIMARY_SERVICES: [{ id: 'solar_film' }, { id: 'smart_film' }], serviceOffering: (id: string) => offerings.find(offering => offering.id === id), serviceOfferingDirection: (id: string) => id.split('_')[0] });
  vm.runInContext(html.slice(html.indexOf('function offeringServiceType('), html.indexOf('function renderNewOrderOfferings(')), context);
  assert.deepEqual(Array.from(context.newOrderSelectedOfferings(), (offering: any) => offering.id), ['a', 'b', 'c']);
  assert.deepEqual(Array.from(context.newOrderSelectedOfferings(), (offering: any) => context.offeringServiceType(offering)), ['solar_film', 'solar_film', 'smart_film']);
});
