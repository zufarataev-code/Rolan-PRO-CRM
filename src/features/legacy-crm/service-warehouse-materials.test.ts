import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { prepareServiceSolutions, serviceSolutionsForViewer } from './service-solutions';

type Row = Record<string, any>;
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function fixture(role = 'owner') {
  const directions = ['smart', 'solar', 'protective', 'decorative', 'privacy'];
  const services = directions.map(id => ({ id: id + '_film', title: id, catalogCategory: id }));
  const db: Row = { settings: { serviceOfferings: [], catalog: [] }, orders: [], supplies: [
    { id: 'power', name: 'Rolan Control 100W', unit: 'pcs', costPerUnit: 250, qty: 5 },
    { id: 'silicone', name: 'Silicone', unit: 'ml', costPerUnit: 0.5, qty: 1000 },
    { id: 'voice', name: 'Voice module', unit: 'pcs', costPerUnit: 40, qty: 2 },
    { id: 'relay', name: 'Relay / switch', unit: 'pcs', costPerUnit: 15, qty: 3 },
  ] };
  let n = 0;
  const fields: Row = {};
  const alerts: string[] = [];
  let renders = 0;
  const c: any = vm.createContext({
    db, console, ORDER_PRIMARY_SERVICES: services, state: {},
    primaryServiceInfo: (id: string) => services.find(item => item.id === id),
    canonicalCatalogCategory: (id: string) => id,
    currentUser: () => ({ role }), uid: () => 'row' + ++n,
    alert: (value: string) => alerts.push(value), save: () => {}, render: () => renders++,
    document: { getElementById: (id: string) => fields[id], querySelectorAll: () => [] },
    getOrder: (id: string) => db.orders.find((item: Row) => item.id === id),
    measureAllWindows: (o: Row) => (o.measurements?.rooms || []).flatMap((room: Row) => (room.windows || []).map((win: Row) => ({ room, win }))),
    projectQuickLines: (o: Row) => (o.extraServices || []).filter((line: Row) => line.quickProjectLine),
    orderUserCanSeeMoney: () => true, projectEstimateMarkChanged: () => {},
    refreshProjectEstimateWorkspace: () => {}, removalPricePerSqft: () => 2.5, fmtMoney: (value: number) => '$' + value,
    academyEsc: (value: unknown) => String(value ?? '').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    supplyUnitLabel: (unit: string) => unit, windowActualAreaSqft: (win: Row) => win.sqft,
    windowCatalog: () => null, getCatalogItem: () => null,
    windowFilmCost: () => 24, windowRetailPrice: () => 120, windowInstallerPayout: () => 6,
  });
  const start = html.indexOf('// ---------- УСЛУГИ ВНУТРИ НАПРАВЛЕНИЙ');
  vm.runInContext(html.slice(start, html.indexOf('function projectQuickLineCatalog(', start)), c);
  vm.runInContext(html.slice(html.indexOf('function orderExtraServicesCost('), html.indexOf('function orderRevenue(')), c);
  vm.runInContext(html.slice(html.indexOf('function offeringServiceType('), html.indexOf('function newOrderSelectedOfferings(')), c);
  return { c, db, fields, alerts, renders: () => renders };
}
function payload(): Row {
  const { db } = fixture();
  db.settings.serviceOfferings = [{ id: 'power_service', direction: 'smart', name: 'Install power supply', unit: 'piece', pricePerSqft: 1000,
    installerRatePerSqft: 350, materialCostPerUnit: 999, materials: [{ supplyId: 'power', qtyPerUnit: 1 }, { supplyId: 'relay', qtyPerUnit: 2 }] }];
  return db;
}
test('every direction exposes new directory services in the Project picker and attaches their warehouse composition', () => {
  const { c, db } = fixture();
  db.orders.push({ id: 'o', serviceType: 'smart_film', serviceTypes: ['smart_film'], extraServices: [] });
  for (const [index, direction] of ['smart', 'solar', 'protective', 'decorative', 'privacy'].entries()) {
    c.addServiceOffering(direction);
    const offering = db.settings.serviceOfferings[index];
    Object.assign(offering, { name: 'Service ' + direction, unit: 'piece', pricePerSqft: 100, materials: [{ supplyId: 'relay', qtyPerUnit: 1 }] });
    const picker = c.projectOfferingPickerHtml(db.orders[0], 'projectCardAddService');
    assert.ok(picker.includes('value="' + offering.id + '"'), direction);
    c.projectAddOfferingLine('o', offering.id);
  }
  assert.equal(db.orders[0].extraServices.length, 5);
  assert.equal(db.orders[0].extraServices[4].offeringMaterials[0].supplyId, 'relay');
  assert.equal(db.orders[0].extraServices[4].serviceType, 'privacy_film');
  db.settings.serviceOfferings[0].active = false;
  assert.ok(!c.projectOfferingPickerHtml(db.orders[0]).includes('value="' + db.settings.serviceOfferings[0].id + '"'));
});
test('owner links and edits actual warehouse items in place without rebuilding the directory', () => {
  const { c, db, fields, renders } = fixture();
  db.settings.serviceOfferings = payload().settings.serviceOfferings;
  const offering = db.settings.serviceOfferings[0];
  fields['service-material-power_service'] = { value: 'voice' };
  fields['service-material-qty-power_service'] = { value: '0.5' };
  c.addServiceOfferingMaterial(offering.id);
  assert.equal(offering.materials[2].qtyPerUnit, 0.5);
  const input = { value: '-1' };
  c.updateServiceOfferingMaterial(offering.id, 'voice', '-1', input);
  assert.equal(input.value, 0.5);
  c.updateServiceOfferingMaterial(offering.id, 'voice', '2');
  assert.equal(offering.materials[2].qtyPerUnit, 2);
  c.removeServiceOfferingMaterial(offering.id, 'voice');
  assert.equal(offering.materials.length, 2);
  assert.equal(renders(), 0);
  const output = c.renderServiceOfferingsSection();
  assert.ok(output.includes('Материалы со склада') && output.includes('Rolan Control 100W'));
  assert.ok(!output.includes('onchange="updateServiceOffering(\'power_service\',\'materialCostPerUnit\''));
});
test('quantity, included and measured materials follow the service volume and replace the manual allowance', () => {
  const { c, db } = fixture();
  db.settings.serviceOfferings = payload().settings.serviceOfferings;
  const offering = db.settings.serviceOfferings[0];
  const line = c.projectOfferingLine(offering, 3);
  assert.equal(c.serviceOfferingMaterialCost(line), 280);
  assert.equal(line.price, 3000);
  assert.equal(c.serviceOfferingMaterialCost(line) * line.qty, 840);
  line.includedBy = 'parent'; line.price = 0;
  assert.equal(c.serviceOfferingMaterialCost(line) * line.qty, 840, 'included hardware still has a real cost');
  const measured = { ...offering, id: 'sized', unit: 'sqft', materials: [{ supplyId: 'silicone', qtyPerUnit: 2 }] };
  const win: Row = { sqft: 12 };
  c.applyWindowOffering(win, measured);
  assert.equal(c.orderSizedServiceMaterialsCost({ measurements: { rooms: [{ windows: [win] }] } }), 12);
  assert.equal(c.orderSizedServiceMaterialsCost({ extraServices: [{ ...win, quickProjectLine: true, qty: 10 }] }), 10);
  const order = { extraServices: [line], measurements: { rooms: [{ windows: [win] }] } };
  assert.equal(c.projectLines(order).reduce((sum: number, item: Row) => sum + item.materialCost, 0), 876);
  assert.equal(c.orderExtraServicesCost(order), 852, 'quantity and measured supplies enter project cost exactly once; film stays separate');
  assert.equal(db.supplies[0].qty, 5, 'estimating does not prematurely deduct stock');
  const names = c.projectLineMaterialNames({ windows: [], sources: [line] });
  assert.ok(names.includes('Rolan Control 100W × 3 pcs'));
  assert.ok(names.includes('Relay / switch × 6 pcs'));
  assert.ok(!JSON.stringify(names).includes('250'));
  offering.materials[0].qtyPerUnit = 99;
  assert.equal(line.offeringMaterials[0].qtyPerUnit, 1, 'saved composition does not follow directory edits');
});
test('server snapshots warehouse composition for owner and manager; forged costs and links do not enter the snapshot', () => {
  for (const owner of [true, false]) {
    const current = payload(), next = clone(current);
    next.orders = [{ id: 'o', serviceType: 'smart_film', extraServices: [{ id: 'line', offeringId: 'power_service', serviceType: 'smart_film',
      qty: 2, offeringMaterials: [{ supplyId: 'voice', qtyPerUnit: 99, costPerUnit: 123 }] }] }];
    assert.equal(prepareServiceSolutions(current, next, owner), null);
    const line = next.orders[0].extraServices[0];
    assert.deepEqual(line.offeringMaterials, [
      { supplyId: 'power', qtyPerUnit: 1, name: 'Rolan Control 100W', unit: 'pcs' },
      { supplyId: 'relay', qtyPerUnit: 2, name: 'Relay / switch', unit: 'pcs' },
    ]);
    assert.equal(line.price, 2000);
    const view = serviceSolutionsForViewer(next, false);
    assert.equal(view.orders[0].extraServices[0].offeringMaterialCost, undefined);
    assert.ok(!JSON.stringify(view.orders[0].extraServices[0].offeringMaterials).includes('cost'));
  }
});
test('server preserves existing composition across directory changes and rejects deleting stock used in projects', () => {
  const before = payload(), first = clone(before);
  first.orders = [{ id: 'o', serviceType: 'smart_film', extraServices: [{ id: 'line', offeringId: 'power_service', serviceType: 'smart_film', qty: 1 }] }];
  assert.equal(prepareServiceSolutions(before, first, true), null);
  const next = clone(first);
  next.settings.serviceOfferings[0].materials[0].qtyPerUnit = 4;
  next.orders[0].extraServices[0].offeringMaterials = [];
  assert.equal(prepareServiceSolutions(first, next, true), null);
  assert.deepEqual(next.orders[0].extraServices[0].offeringMaterials, first.orders[0].extraServices[0].offeringMaterials);
  const removed = clone(next);
  removed.settings.serviceOfferings[0].materials = [];
  removed.supplies = removed.supplies.filter((s: Row) => s.id !== 'power');
  assert.match(prepareServiceSolutions(next, removed, true) || '', /Нельзя удалить/);
  const old = payload();
  old.orders = [{ id: 'old', serviceType: 'smart_film', extraServices: [{ id: 'line', type: 'offering', offeringId: 'power_service', serviceType: 'smart_film', unit: 'piece', unitPrice: 1000, qty: 1 }] }];
  const roundtrip = clone(old);
  assert.equal(prepareServiceSolutions(old, roundtrip, true), null);
  assert.equal(roundtrip.orders[0].extraServices[0].offeringMaterials, undefined, 'historical estimates are not silently changed');
});
test('server rejects unknown or repeated warehouse positions and invalid consumption; manager cannot edit bindings', () => {
  for (const materials of [[{ supplyId: 'missing', qtyPerUnit: 1 }], [{ supplyId: 'power', qtyPerUnit: 0 }],
    [{ supplyId: 'power', qtyPerUnit: -1 }], [{ supplyId: 'power', qtyPerUnit: Infinity }],
    [{ supplyId: 'power', qtyPerUnit: 1 }, { supplyId: 'power', qtyPerUnit: 2 }]]) {
    const current = payload(), next = clone(current);
    next.settings.serviceOfferings[0].materials = materials;
    assert.ok(prepareServiceSolutions(current, next, true));
  }
  const current = payload(), next = clone(current);
  next.settings.serviceOfferings[0].materials[0].qtyPerUnit = 7;
  assert.match(prepareServiceSolutions(current, next, false) || '', /Только владелец/);
});
test('every inline CRM script remains syntactically valid', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(value => value.trim());
  assert.ok(scripts.length);
  scripts.forEach(script => new vm.Script(script));
});

