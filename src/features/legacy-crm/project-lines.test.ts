import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { prepareServiceSolutions } from './service-solutions';

// Owner, 2026-10-08: the project is a container — one list of its lines
// (windows of a service, quantity services, included services, other work),
// each with its quantity, customer price, material, installer pay, specialist
// and date. The list reads the stored work; its prices add up to the revenue.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;
// Values built inside the vm context come from another realm: compare them as plain data.
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

function load() {
  const services = [
    { id: 'protective_film', catalogCategory: 'protective', title: 'Защитная' },
    { id: 'solar_film', catalogCategory: 'solar', title: 'Солнцезащитная' },
    { id: 'smart_film', catalogCategory: 'smart', title: 'Смарт' },
  ];
  const db: Row = {
    settings: {
      complexityCoefs: { standard: 1 },
      installerRates: { workTypes: { washing: 4 } },
      catalog: [{ id: 'f8', category: 'protective', brand: 'R', model: '8 mil', costPerSqft: 2, wastePct: 10, retailPerSqft: 12 }],
      serviceOfferings: [
        { id: 'a1', direction: 'protective', name: 'A1 8 mil', unit: 'sqft', pricePerSqft: 14, installerRatePerSqft: 3, includes: ['silicone'] },
        { id: 'silicone', direction: 'protective', name: 'Силикон', unit: 'lft', pricePerSqft: 3.5, installerRatePerSqft: 1, materialCostPerUnit: 0.4 },
        { id: 'zone', direction: 'smart', name: 'Подключение зоны', unit: 'zone', pricePerSqft: 100, installerRatePerSqft: 50, materialCostPerUnit: 12 },
      ],
    },
    orders: [] as Row[],
  };
  const users: Row = { i1: { id: 'i1', name: 'Алан' }, i2: { id: 'i2', name: 'Рустам' } };
  const context: any = vm.createContext({
    db, console, Math, Number, Set, Map, String, Array, Object,
    ORDER_PRIMARY_SERVICES: services,
    primaryServiceInfo: (id: string) => services.find(item => item.id === id),
    canonicalCatalogCategory: (value: string) => value,
    canonicalServiceCodeForOrderService: () => '',
    currentUser: () => ({ role: 'owner' }),
    getUser: (id: string) => users[id],
    getCatalogItem: (id: string) => db.settings.catalog.find((item: Row) => item.id === id),
    windowCatalog: (win: Row) => db.settings.catalog.find((item: Row) => item.id === win.catalogId),
    windowActualAreaSqft: (win: Row) => Number(win.sqft) || 0,
    warehouseCatalogCostPerSqft: () => 2,
    filmRate: () => 2.5,
    filmCategory: () => 'other',
    installerServiceRateByCategory: (category: string) => ({ protective: 3, smart: 5 } as Row)[category] || 2.5,
    measureAllWindows: (o: Row) => (o.measurements?.rooms || []).flatMap((room: Row) => (room.windows || []).map((win: Row) => ({ room, win }))),
    projectQuickLines: (o: Row) => (o.extraServices || []).filter((line: Row) => line.quickProjectLine),
    fmtMoney: (value: number) => `$${Number(value).toFixed(2)}`,
    fmtDateTime: (value: string) => String(value).slice(0, 10),
    academyEsc: (value: unknown) => String(value ?? ''),
    alert: () => undefined, save: () => undefined, render: () => undefined, uid: () => 'id',
  });
  const start = html.indexOf('// ---------- УСЛУГИ ВНУТРИ НАПРАВЛЕНИЙ');
  vm.runInContext(html.slice(start, html.indexOf('function projectQuickLineCatalog(', start)), context);
  vm.runInContext(html.slice(html.indexOf('function windowRetailPrice('), html.indexOf('function orderInstallerPayout(o)')), context);
  return { c: context, db };
}

const protectiveWindow = (id: string, sqft: number) => ({ id, sqft, offeringId: 'a1', offeringName: 'A1 8 mil', pricePerSqft: 14, catalogId: 'f8', measureScope: 'protective_film' });

function project(): Row {
  return {
    id: 'o',
    serviceType: 'protective_film',
    measurements: { rooms: [{ id: 'r', windows: [protectiveWindow('w1', 10), protectiveWindow('w2', 20), { id: 'w3', sqft: 5, pricePerSqft: 8, measureScope: 'solar_film' }] }] },
    extraServices: [
      { id: 's', type: 'offering', offeringId: 'silicone', includedBy: 'a1', unit: 'lft', qty: 56, unitPrice: 0, price: 0, serviceType: 'protective_film', offeringName: 'Силикон' },
      { id: 'z', type: 'offering', offeringId: 'zone', unit: 'zone', qty: 3, unitPrice: 100, price: 300, serviceType: 'smart_film', offeringName: 'Подключение зоны' },
      { id: 'wash', type: 'washing', label: 'Мойка стёкол', qty: 2, price: 80 },
      // A quick line is only an estimate before measurement: with windows it is not part of the project.
      { id: 'q', quickProjectLine: true, unit: 'sqft', qty: 10, unitPrice: 10, price: 100, serviceType: 'solar_film' },
    ],
    serviceSchedules: [
      { id: 'offering:a1', installationAt: '2026-10-10T16:00:00Z', installerIds: ['i1'] },
      { id: 'line:s', installationAt: '2026-10-12T16:00:00Z', installerIds: ['i2'] },
    ],
  };
}

test('a project is one list of lines: windows of a service together, every other row on its own', () => {
  const { c } = load();
  const lines = c.projectLines(project());
  assert.deepEqual(plain(lines.map((line: Row) => [line.key, line.kind])), [
    ['offering:a1', 'windows'],
    ['direction:solar_film', 'windows'],
    ['line:s', 'included'],
    ['line:z', 'quantity'],
    ['line:wash', 'work'],
  ]);
  const [a1, solar, silicone, zone, wash] = lines;
  assert.deepEqual(plain([a1.qty, a1.price, a1.materialCost, a1.installerPay, a1.unitShort, a1.windows.length]), [30, 420, 66, 90, 'sq ft', 2]);
  assert.deepEqual(plain([solar.qty, solar.price, solar.installerPay]), [5, 40, 12.5]);
  assert.deepEqual(plain([silicone.qty, silicone.price, Math.round(silicone.materialCost * 100) / 100, silicone.installerPay, silicone.unitShort, silicone.includedBy]), [56, 0, 22.4, 56, 'lin ft', 'a1']);
  assert.deepEqual(plain([zone.qty, zone.price, zone.materialCost, zone.installerPay, zone.unitShort]), [3, 300, 36, 150, 'зона']);
  assert.deepEqual(plain([wash.qty, wash.price, wash.installerPay]), [2, 80, 8]);
  // Each line has its own specialist and date; a line nobody scheduled stays unassigned.
  assert.deepEqual(plain([a1.installerIds, a1.installationAt]), [['i1'], '2026-10-10T16:00:00Z']);
  assert.deepEqual(plain([silicone.installerIds, silicone.installationAt]), [['i2'], '2026-10-12T16:00:00Z']);
  assert.deepEqual(plain([zone.installerIds, zone.installationAt]), [[], '']);
});

test('the lines add up to the project revenue and the reference installer pay', () => {
  const { c } = load();
  const o = project();
  const lines = c.projectLines(o);
  const sum = (field: string) => lines.reduce((total: number, line: Row) => total + line[field], 0);
  assert.equal(sum('price'), c.orderRevenue(o));
  assert.equal(sum('price'), 840);
  assert.equal(sum('installerPay'), c.orderInstallerPayoutBreakdown(o).total);
  assert.equal(sum('materialCost') - 66, c.orderExtraServicesCost(o), 'quantity services carry their own material');

  // Before measurement the quick lines are the project.
  const draft: Row = { id: 'd', serviceType: 'solar_film', measurements: { rooms: [] }, extraServices: [
    { id: 'q', quickProjectLine: true, unit: 'sqft', qty: 10, unitPrice: 10, price: 100, serviceType: 'solar_film', catalogId: 'f8' },
    { id: 'z', type: 'offering', offeringId: 'zone', unit: 'zone', qty: 1, unitPrice: 100, price: 100, serviceType: 'smart_film' },
  ] };
  const draftLines = c.projectLines(draft);
  assert.deepEqual(plain(draftLines.map((line: Row) => line.kind)), ['quick', 'quantity']);
  assert.equal(draftLines.reduce((total: number, line: Row) => total + line.price, 0), c.orderRevenue(draft));
  assert.equal(draftLines.reduce((total: number, line: Row) => total + line.installerPay, 0), c.orderInstallerPayoutBreakdown(draft).total);
});

test('the project card table shows money by role; the crew rows carry no prices', () => {
  const { c } = load();
  const o = project();
  const owner = c.projectLinesTableHtml(o, { money: true, economics: true });
  assert.match(owner, /<th class="money">Материал<\/th><th class="money">Специалисту<\/th>/);
  assert.match(owner, /Итого<\/td><td><\/td><td class="money">\$840\.00<\/td>/);
  assert.match(owner, /входит в «A1 8 mil»/);
  assert.match(owner, /в пакете · \$0/);
  assert.match(owner, /Защитная · 2 окна/);
  assert.match(owner, /Материал по окнам/);
  const noWindows = project();
  noWindows.measurements.rooms = [];
  assert.doesNotMatch(c.projectLinesTableHtml(noWindows, { money: true, economics: true }), /Материал по окнам/);
  assert.deepEqual([1, 2, 5, 11, 22, 25].map(n => c.projectWindowsWord(n)), ['окно', 'окна', 'окон', 'окон', 'окна', 'окон']);
  const manager = c.projectLinesTableHtml(o, { money: true, economics: false });
  assert.match(manager, /\$420\.00/);
  assert.doesNotMatch(manager, /Материал|Специалисту/);
  const field = c.projectLinesTableHtml(o, { money: false, economics: false });
  assert.doesNotMatch(field, /\$/);
  assert.match(field, /Алан/);
  const crew = c.projectLineScopeRows(o);
  assert.doesNotMatch(crew, /\$/);
  assert.match(crew, /Рустам · 2026-10-12/);
  assert.match(crew, /Подключение зоны[\s\S]*не назначен · дата не назначена/);
});

test('the project card has one «Услуги проекта» tile; work documents open for any line', () => {
  const card = html.slice(html.indexOf('function renderOrderCleanDetails('), html.indexOf('function renderOrderCleanDetails(') + 40000);
  assert.match(card, /key: 'services', icon: '🧩', title: 'Услуги проекта'/);
  assert.match(card, /projectLinesTableHtml\(o, \{ money: canSeeMoney, economics: canSeeInternalEconomics \}\)/);
  assert.match(card, /const hasWorkScope = hasMeasurements \|\| lines\.length > 0;/);
  assert.match(card, /scheduleInstallationPrompt\('\$\{o\.id\}'\)`, disabled: !canManage \|\| !o\.productionReadyAt/);
});

test('proposals no longer offer add-ons priced in code; old selections keep their totals', () => {
  assert.doesNotMatch(html, /PREMIUM_EXTRA_SERVICES/);
  const defaults = html.slice(html.indexOf('function premiumDefaultSelections('), html.indexOf('function premiumHydrateProposal('));
  assert.doesNotMatch(defaults, /LEGACY_PROPOSAL_EXTRAS/);
  const hydrate = html.slice(html.indexOf('function premiumHydrateProposal('), html.indexOf('function ensurePremiumProposal('));
  assert.doesNotMatch(hydrate, /LEGACY_PROPOSAL_EXTRAS/);
  const toggle = html.slice(html.indexOf('function premiumToggleService('), html.indexOf('function premiumSetPaymentMode('));
  assert.match(toggle, /if \(prop\.selections\.services\?\.\[serviceId\] === true\) prop\.selections\.services\[serviceId\] = false;/);
  assert.match(html, /\$\{premiumLegacyExtrasSelected\(prop\)\.length \? `<div class="pp-panel">/);
  // The totals still count an add-on a proposal already selected.
  assert.match(html, /const flatAndArea = LEGACY_PROPOSAL_EXTRAS\n\s+\.filter\(s => prop\.selections\.services\?\.\[s\.id\] && s\.unit !== 'percent'\)/);
});

test('the price for removing old film is the owner\'s setting', () => {
  const sync = html.slice(html.indexOf('function removalPricePerSqft() {'), html.indexOf('// Legacy m² helpers'));
  const db: Row = { settings: {} };
  const c: any = vm.createContext({ db, Number, Math, orderRemovalAreaSqft: (o: Row) => o.area });
  vm.runInContext(sync, c);
  const o: Row = { area: 10, extraServices: [] };
  c.syncOrderWindowRemovalService(o);
  assert.deepEqual([o.extraServices[0].unitPrice, o.extraServices[0].price], [2.5, 25]);
  db.settings.removalPricePerSqft = 3;
  const fresh: Row = { area: 10, extraServices: [] };
  c.syncOrderWindowRemovalService(fresh);
  assert.deepEqual([fresh.extraServices[0].unitPrice, fresh.extraServices[0].price], [3, 30]);
  c.syncOrderWindowRemovalService(o);
  assert.equal(o.extraServices[0].unitPrice, 2.5, 'a saved line keeps its price');
  assert.match(html, /onchange="updateRemovalPrice\(this\.value\)"/);

  const current: Row = { settings: { serviceOfferings: [] }, orders: [] };
  const manager: Row = structuredClone(current);
  manager.settings.removalPricePerSqft = 1;
  assert.equal(prepareServiceSolutions(current, manager, false), 'Только владелец может менять справочник услуг.');
  const owner: Row = structuredClone(current);
  owner.settings.removalPricePerSqft = 3.25;
  assert.equal(prepareServiceSolutions(current, owner, true), null);
  owner.settings.removalPricePerSqft = -1;
  assert.match(prepareServiceSolutions(current, owner, true)!, /положительным/);
  // A manager's save that keeps the owner's price passes.
  const saved: Row = { settings: { serviceOfferings: [], removalPricePerSqft: 3 }, orders: [] };
  assert.equal(prepareServiceSolutions(saved, structuredClone(saved), false), null);
});
