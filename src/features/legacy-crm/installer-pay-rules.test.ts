import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-30: installer pay — rate per service, × complexity for film,
// silicone «$1.5 за фут или $200 за день — что больше», split equally, senior
// +10%, $200 minimum for the crew per visit, road $20/h each beyond 30 miles.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

type Row = Record<string, any>;
const offerings: Row = {
  solar: { id: 'solar', installerRatePerSqft: 2.5 },
  smart: { id: 'smart', installerRatePerSqft: 5 },
  silicone: { id: 'silicone', installerRatePerSqft: 1.5, installerDayMinimum: 200 },
};

function load(order: Row, settings: Row = {}) {
  const users: Row[] = [
    { id: 'jr', role: 'installer', payConfig: { type: 'per_sqft' } },
    { id: 'sr', role: 'installer', installerLevel: 'senior', payConfig: { type: 'per_sqft' } },
  ];
  const groups = (o: Row) => [
    { id: 'film', windows: o.windows, lines: [] },
    ...o.extraServices.map((line: Row) => ({ id: `line:${line.id}`, windows: [], lines: [line] })),
  ];
  const ctx: any = vm.createContext({
    db: { settings: { seniorInstallerBonusPct: 10, complexityCoefs: { standard: 1, ladder: 1.35 }, ...settings } },
    getUser: (id: string) => users.find(u => u.id === id),
    projectStages: () => [],
    measureAllWindows: (o: Row) => o.windows.map((win: Row) => ({ win })),
    projectServiceCrew: (o: Row) => o.installerIds,
    windowActualAreaSqft: (w: Row) => w.sqft,
    installerRateForWindow: (_u: Row, w: Row) => offerings[w.offeringId].installerRatePerSqft,
    serviceOffering: (id: string) => offerings[id],
    serviceOfferingInstallerRate: (line: Row) => offerings[line.offeringId].installerRatePerSqft,
    installerAdditionalWorkRate: () => 0,
    projectServiceGroups: groups,
    projectServiceAssignment: (o: Row, g: Row) => o.plans?.[g.id] || { installationAt: o.installationAt },
    projectQuickLines: () => [],
    installerRateForQuickLine: () => 0,
    orderRevenue: () => 0,
  });
  vm.runInContext(['installerPayRules', 'installerComplexityFactor', 'installPlanEnd', 'installPlanDayKeys', 'installServiceDays', 'installTripCount',
    'installerWorkLinePay', 'orderAdditionalWorkPayoutForUser', 'orderQuickInstallerPayoutForUser', 'orderInstallerBrigadeBase', 'installerTravel',
    'installerVisitExtras', 'orderInstallerPayoutForUser'].map(name => fn(stages, name)).join('\n') + fn(html, 'installerSeniorFactor'), ctx);
  return (id: string) => Math.round(ctx.orderInstallerPayoutForUser(order, id) * 100) / 100;
}

test('the owner\'s example: 300 sq ft solar on a ladder, 60 ft silicone, 1.5 h of road', () => {
  const pay = load({
    installerIds: ['jr', 'sr'], complexity: 'ladder', installationAt: '2026-11-02T09:00',
    windows: [{ offeringId: 'solar', sqft: 300 }],
    extraServices: [{ id: 's', offeringId: 'silicone', qty: 60 }],
    travel: { miles: 42, minutes: 45 },
  });
  // film 300 × 2.5 × 1.35 = 1012.50; silicone max(90, 200) = 200; crew 1212.50 → 606.25 each
  assert.equal(pay('jr'), 606.25 + 30);
  assert.equal(pay('sr'), Math.round((606.25 * 1.1 + 30) * 100) / 100);
});

test('a small job pays the crew minimum, split equally', () => {
  const pay = load({ installerIds: ['jr', 'sr'], installationAt: '2026-11-02T09:00', windows: [{ offeringId: 'smart', sqft: 20 }], extraServices: [], travel: { miles: 12, minutes: 20 } });
  assert.equal(pay('jr'), 100, '20 × $5 = $100 → topped up to $200 for the crew');
  assert.equal(pay('sr'), 110);
});

test('road: none within 30 miles, hours typed by the manager always count', () => {
  const near = load({ installerIds: ['jr'], windows: [{ offeringId: 'solar', sqft: 400 }], extraServices: [], travel: { miles: 25, minutes: 40 } });
  assert.equal(near('jr'), 1000);
  const typed = load({ installerIds: ['jr'], windows: [{ offeringId: 'solar', sqft: 400 }], extraServices: [], travel: { hours: 2 } });
  assert.equal(typed('jr'), 1040);
  const rules = load({ installerIds: ['jr'], windows: [{ offeringId: 'solar', sqft: 400 }], extraServices: [], travel: { miles: 50, minutes: 60 } }, { installerPayRules: { travelPerHour: 25 } });
  assert.equal(rules('jr'), 1050, 'rate from the settings');
});

test('silicone over two days pays the day minimum twice', () => {
  const pay = load({
    installerIds: ['jr'], windows: [], travel: {},
    extraServices: [{ id: 's', offeringId: 'silicone', qty: 100 }],
    plans: { 'line:s': { installationAt: '2026-11-02T09:00', endsAt: '2026-11-03T17:00' } },
  });
  assert.equal(pay('jr'), 400, 'max(100 × 1.5, 200 × 2 days)');
});

test('settings live in «Ставки и расходы»; the road shows in the install window', () => {
  assert.match(fn(stages, 'renderRatesCosts'), /\$\{ratesPayRulesHtml\(\)\}/);
  assert.match(fn(stages, 'renderRatesCosts'), /ratesUpdateOffering\('\$\{item\.id\}','installerDayMinimum'/);
  assert.match(fn(stages, 'installWindowHtml'), /\$\{installTravelHtml\(o\)\}/);
  assert.match(fn(stages, 'openInstallWindow'), /if \(!key\) projectTravelRefresh\(oid\);/);
  assert.match(fn(html, 'updateServiceOffering'), /'installerDayMinimum'/);
});

test('the day minimum is owner economics: hidden from managers, kept on their saves', async () => {
  const { serviceSolutionsForViewer } = await import('./service-solutions');
  const payload = { settings: { serviceOfferings: [{ id: 'silicone', direction: 'general', name: 'Силикон', installerDayMinimum: 200 }] }, orders: [] };
  assert.equal(serviceSolutionsForViewer(payload, false).settings.serviceOfferings[0].installerDayMinimum, undefined);
  assert.equal(serviceSolutionsForViewer(payload, true).settings.serviceOfferings[0].installerDayMinimum, 200);
});
