import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { prepareServiceScopeApprovals, serviceScopeApproved } from './service-scope-approvals';

// Owner, 2026-11-22 (#592): «С TintWiz загрузил проекты, но они там
// неправильно: там солнцезащитные, а по факту приватная — нужна возможность
// менять направление, редактировать проект».
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };
const constant = (src: string, name: string, close: string) => { const a = src.indexOf(`const ${name} = `); assert.ok(a >= 0, name); return src.slice(a, src.indexOf(close, a) + close.length); };

const OFFERINGS: Record<string, any> = {
  solar_install: { id: 'solar_install', name: 'Солнцезащитная установка', direction: 'solar' },
  privacy_install: { id: 'privacy_install', name: 'Приватная установка', direction: 'privacy' },
};
const CATALOG: Record<string, any> = { solar1: { id: 'solar1', brand: 'Brand', model: 'Solar 20', category: 'solar', retailPerSqft: 12, costPerSqft: 3 } };

function sandbox(user: any = { id: 'owner', role: 'owner' }) {
  const ctx: any = {
    state: { currentUserId: user?.id || null },
    db: { settings: { complexityCoefs: { standard: 1 }, catalog: Object.values(CATALOG) }, orders: [] as any[], clients: [] },
    marks: [] as string[],
    currentUser: () => user,
    orderUserCanSeeMoney: (_o: unknown, u: any) => !!u && (u.role === 'owner' || u.money === true),
    serviceOffering: (id: string) => OFFERINGS[id],
    serviceOfferingNeedsSizes: () => true,
    canonicalCatalogCategory: (value: string) => value,
    getCatalogItem: (id: string) => CATALOG[id],
    mm2_to_sqft: (mm2: number) => mm2 / 92903.04,
    measurePanelAreaSqft: () => 0,
    installerRateForQuickLine: (_u: unknown, line: any) => (line.serviceType === 'solar_film' ? 2.5 : 4),
    syncProjectIncludedServices: () => false,
    projectPrunePlans: () => {},
    projectCardSyncCrew: () => {},
    projectQuickLineIsActive: () => true,
    getOrder: (id: string) => ctx.db.orders.find((o: any) => o.id === id),
    projectDirectionGroups: (o: any) => {
      const scope = ctx.orderMeasureScope(o);
      const keys = [
        ...ctx.measureAllWindows(o).map(({ win }: any) => win.measureScope || scope),
        ...(o.extraServices || []).map((line: any) => line.serviceType || o.serviceType || scope),
      ];
      return [...new Set(keys)].map(key => ({ key }));
    },
  };
  ctx.projectEstimateMarkChanged = (_o: unknown, reason: string) => ctx.marks.push(reason);
  // Windows group by their service or direction, rows by themselves — as the card does.
  ctx.projectServiceGroups = (o: any) => {
    const scope = ctx.orderMeasureScope(o);
    const groups = new Map<string, any>();
    const group = (id: string) => { if (!groups.has(id)) groups.set(id, { id, windows: [], lines: [] }); return groups.get(id); };
    ctx.measureAllWindows(o).forEach(({ win }: any) => group(win.offeringId ? `offering:${win.offeringId}` : `direction:${win.measureScope || scope}`).windows.push(win));
    (o.extraServices || []).forEach((line: any) => group(`line:${line.id}`).lines.push(line));
    return [...groups.values()];
  };
  vm.createContext(ctx);
  const code = [
    constant(html, 'ORDER_PRIMARY_SERVICES', '\n];'),
    constant(html, 'CLOSED_PROJECT_STATUSES', '];'),
    constant(html, 'PROJECT_SCOPE_WINDOW_FIELDS', '];'),
    constant(html, 'PROJECT_SCOPE_LINE_FIELDS', '];'),
    ...['orderMeasureScope', 'measureAllWindows', 'primaryServiceInfo', 'canonicalServiceDirection', 'serviceOfferingDirection',
      'projectPlural', 'projectWindowsWord', 'windowActualAreaSqft', 'windowCatalog', 'windowRetailPrice', 'windowFilmCost',
      'windowServiceInstallerRate', 'serviceOfferingInstallerRate', 'orderFilmRevenue', 'orderExtraServicesRevenue', 'orderRevenue'].map(name => fn(html, name)),
    ...['projectServiceScope', 'projectDirectionCanMove', 'projectDirectionMoveWindows', 'projectDirectionMoveApply', 'projectDirectionSkipNote', 'projectIsWizImport', 'projectMainDirectionKeys',
      'wizImportOrders', 'wizDirectionBulkMove'].map(name => fn(stages, name)),
  ].join('\n');
  vm.runInContext(code.replace(/^const (\w+) = /gm, 'var $1 = '), ctx);
  return ctx;
}

// A project from the old TintWiz import: solar film guessed on an «Импорт» window,
// the paid revenue on its own line, status completed.
function wizProject(id: string, extra: any = {}) {
  return {
    id, number: `PO-${id}`, status: 'completed', paid: 7500, _importSource: 'wiz', _imported: true,
    measurements: { rooms: [{ id: 'r', name: 'Импорт', windows: [{ id: `w${id}`, name: 'Импорт', width: 1000, height: 1000, qty: 1, catalogId: 'solar1', filmType: 'Brand — Solar 20' }] }] },
    extraServices: [{ id: `l${id}`, type: 'custom', label: 'Услуга по проекту (импорт Wiz)', qty: 1, price: 7500, cost: 0 }],
    timeline: [{ at: '2026-01-01T00:00:00Z', key: 'orderCreated' }],
    ...extra,
  };
}

test('an imported, paid TintWiz project moves from solar to privacy without touching its money', () => {
  const ctx = sandbox();
  const o = wizProject('1');
  ctx.db.orders.push(o);
  const revenueBefore = ctx.orderRevenue(o);
  const result = ctx.projectDirectionMoveApply(o, 'solar_film', 'privacy_film', 'owner');
  assert.equal(result.closed, true);
  assert.equal(o.serviceType, 'privacy_film');
  assert.deepEqual([...o.serviceTypes], ['privacy_film']);
  assert.equal(ctx.orderMeasureScope(o), 'privacy_film');
  const win = o.measurements.rooms[0].windows[0];
  assert.equal(win.measureScope, 'privacy_film');
  assert.equal(win.catalogId, 'solar1', 'a closed project keeps its film, so its price and cost stay');
  assert.equal(o.extraServices[0].serviceType, 'privacy_film', 'the TintWiz revenue line moves with the project');
  assert.equal(o.extraServices[0].price, 7500);
  assert.equal(o.paid, 7500);
  assert.equal(o.status, 'completed');
  assert.equal(ctx.orderRevenue(o), revenueBefore);
  assert.deepEqual(ctx.marks, [], 'a closed project does not reopen its approved estimate');
  const entry = o.timeline.at(-1);
  assert.equal(entry.key, 'direction_moved');
  assert.equal(entry.by, 'owner');
  assert.match(entry.note, /^Направление: Солнцезащитная плёнка → Приватная плёнка/);
  assert.match(entry.note, /сумма и оплаты без изменений/);
  assert.ok(o._directionCheckedAt);
});

test('on a closed project a paid service of the old direction stays, and quick lines keep their pay', () => {
  const ctx = sandbox();
  const o: any = {
    id: 'c', status: 'act_signed', serviceType: 'solar_film', serviceTypes: ['solar_film'],
    measurements: { rooms: [{ id: 'r', windows: [
      { id: 'a', measureScope: 'solar_film', offeringId: 'solar_install', catalogId: 'solar1', width: 1000, height: 1000, qty: 1 },
      { id: 'b', measureScope: 'solar_film', catalogId: 'solar1', width: 1000, height: 1000, qty: 1 },
    ] }] },
    extraServices: [{ id: 'q', quickProjectLine: true, serviceType: 'solar_film', unit: 'sqft', qty: 40, price: 600, label: 'Солнцезащитная плёнка' }],
    serviceProgress: { 'direction:solar_film': { status: 'done' } },
    serviceSchedules: [{ id: 'direction:solar_film', installerIds: ['i1'] }],
  };
  const revenueBefore = ctx.orderRevenue(o);
  const result = ctx.projectDirectionMoveApply(o, 'solar_film', 'privacy_film', 'owner');
  assert.equal(result.kept, 1);
  assert.equal(o.measurements.rooms[0].windows[0].measureScope, 'solar_film', 'the window priced by the solar service stays');
  assert.equal(o.measurements.rooms[0].windows[1].measureScope, 'privacy_film');
  assert.equal(o.serviceType, 'solar_film', 'the main direction stays while a paid service of it remains');
  assert.deepEqual([...o.serviceTypes].sort(), ['privacy_film', 'solar_film']);
  const quick = o.extraServices[0];
  assert.equal(quick.serviceType, 'privacy_film');
  assert.equal(quick.offeringInstallerRate, 2.5, 'the pay rate of finished work is kept');
  assert.equal(quick.label, 'Приватная плёнка');
  assert.equal(ctx.orderRevenue(o), revenueBefore);
  assert.deepEqual(Object.keys(o.serviceProgress), ['direction:privacy_film'], 'progress of finished work follows the direction');
  assert.equal(o.serviceSchedules[0].id, 'direction:privacy_film');
});

test('an open project still drops the old services and film, but keeps a custom revenue line', () => {
  const ctx = sandbox();
  const o: any = {
    id: 'o', status: 'proposal_accepted', serviceType: 'solar_film', serviceTypes: ['solar_film'], offeringIds: ['solar_install'],
    measurements: { rooms: [{ id: 'r', windows: [{ id: 'a', measureScope: 'solar_film', offeringId: 'solar_install', catalogId: 'solar1', filmType: 'x', width: 1000, height: 1000, qty: 1 }] }] },
    extraServices: [
      { id: 's', offeringId: 'solar_install', serviceType: 'solar_film', qty: 1, price: 200 },
      { id: 'w', type: 'custom', label: 'Услуга по проекту (импорт Wiz)', qty: 1, price: 900 },
    ],
  };
  ctx.projectDirectionMoveApply(o, 'solar_film', 'privacy_film', 'owner');
  const win = o.measurements.rooms[0].windows[0];
  assert.equal(win.measureScope, 'privacy_film');
  assert.equal(win.offeringId, '');
  assert.equal(win.catalogId, '');
  assert.deepEqual(o.extraServices.map((line: any) => line.id), ['w']);
  assert.equal(o.extraServices[0].serviceType, 'privacy_film');
  assert.deepEqual([...o.offeringIds], []);
  assert.equal(o.serviceType, 'privacy_film');
  assert.equal(ctx.marks.length, 1, 'an open project asks to re-check its estimate');
});

test('the owner fixes three imported projects at once, each with its own history entry', () => {
  const ctx = sandbox();
  const projects = ['1', '2', '3'].map(id => wizProject(id));
  projects[2].status = 'installation_scheduled';
  ctx.db.orders.push(...projects, { id: 'manual', status: 'completed', serviceType: 'solar_film', measurements: { rooms: [] }, extraServices: [] });
  assert.equal(ctx.wizImportOrders().length, 3);
  const revenueBefore = projects.map(o => ctx.orderRevenue(o));
  const n = ctx.wizDirectionBulkMove(['1', '2', '3', 'manual'], 'privacy_film', 'owner');
  assert.equal(n, 3, 'only TintWiz imports are touched');
  projects.forEach(o => {
    assert.equal(o.serviceType, 'privacy_film');
    assert.equal(o.extraServices[0].price, 7500);
    assert.equal(ctx.orderRevenue(o), revenueBefore[projects.indexOf(o)], 'the bulk fix keeps the money of open projects too');
    const moved = o.timeline.filter((entry: any) => entry.key === 'direction_moved');
    assert.equal(moved.length, 1);
    assert.match(moved[0].note, /массовая правка импорта TintWiz/);
  });
  assert.equal(ctx.getOrder('manual').serviceType, 'solar_film');
});

test('a manager without money rights cannot change the direction of a closed project', () => {
  const manager = sandbox({ id: 'm', role: 'manager' });
  assert.equal(manager.projectDirectionCanMove(wizProject('1'), { id: 'm', role: 'manager' }), false);
  const withMoney = sandbox({ id: 'm2', role: 'manager', money: true });
  assert.equal(withMoney.projectDirectionCanMove(wizProject('1'), { id: 'm2', role: 'manager', money: true }), true);
  const win = fn(stages, 'projectDirectionWindowHtml');
  assert.match(win, /\$\{projectDirectionCanMove\(o\) \? projectDirectionMoveHtml\(o, directionKey\) : ''\}/, 'the move is offered by money rights, closed or not');
  assert.doesNotMatch(fn(stages, 'projectDirectionMove'), /CLOSED_PROJECT_STATUSES\.includes\(o\.status\)\) return;/);
});

test('a new TintWiz import guesses no direction and no film', () => {
  const importer = fn(html, 'importWizRows');
  assert.doesNotMatch(importer, /category === 'solar'/);
  assert.match(importer, /filmType: '', catalogId: null,\s*pricePerSqft: 0, offeringInstallerRate: 0, importPlaceholder: true,/);
  assert.match(importer, /_importSource: 'wiz'/);
  // The card asks to check the direction; the projects list opens the bulk fix for the owner.
  assert.match(fn(stages, 'renderProjectCardServices'), /projectWizDirectionNoticeHtml\(o\)/);
  assert.match(fn(stages, 'projectWizDirectionNoticeHtml'), /Проект из TintWiz: проверьте направление/);
  assert.match(fn(html, 'renderOrders'), /currentUser\(\)\?\.role === 'owner' && typeof wizImportOrders === 'function'[\s\S]*openWizDirectionBulk\(\)/);
  assert.match(fn(stages, 'openWizDirectionBulk'), /if \(currentUser\(\)\?\.role !== 'owner'\) return;/);
  assert.match(fn(stages, 'wizDirectionBulkApply'), /if \(!confirm\(`Сменить направление у \$\{ids\.length\}/);
  assert.match(html, /direction_checked: 'Направление проверено'/);
});

test('the importer no longer adds the window price on top of the TintWiz total', () => {
  const ctx = sandbox();
  const placeholder = { id: 'w', name: 'Импорт', width: 1000, height: 1000, qty: 1, filmType: '', catalogId: null, pricePerSqft: 0, offeringInstallerRate: 0, importPlaceholder: true };
  const o = { status: 'completed', measurements: { rooms: [{ windows: [placeholder] }] }, extraServices: [{ type: 'custom', qty: 1, price: 7500 }] };
  assert.equal(ctx.orderRevenue(o), 7500);
  assert.equal(ctx.windowServiceInstallerRate(placeholder), 0);
});

test('client approvals and crews follow the moved direction, so the revenue stays', () => {
  const ctx = sandbox();
  const o: any = {
    id: 's', status: 'completed', serviceType: 'solar_film', serviceTypes: ['solar_film'],
    measurements: { rooms: [{ id: 'r', windows: [{ id: 'a', measureScope: 'solar_film', catalogId: 'solar1', width: 1000, height: 1000, qty: 1 }] }] },
    extraServices: [{ id: 'q', quickProjectLine: true, serviceType: 'solar_film', unit: 'sqft', qty: 40, price: 600, label: 'Солнцезащитная плёнка' }],
    serviceSchedules: [{ id: 'direction:solar_film', installerIds: ['i1'] }],
    serviceScopeApprovals: [] as any[],
  };
  const groups = ctx.projectServiceGroups(o);
  o.serviceScopeApprovals = groups.map((group: any) => ({ serviceId: group.id, scope: ctx.projectServiceScope(o, group) }));
  const approved = (order: any) => ctx.projectServiceGroups(order).filter((group: any) => order.serviceScopeApprovals.some((a: any) => a.serviceId === group.id && a.scope === ctx.projectServiceScope(order, group))).map((group: any) => group.id).sort();
  assert.deepEqual(approved(o), ['direction:solar_film', 'line:q']);
  ctx.projectDirectionMoveApply(o, 'solar_film', 'privacy_film', 'owner');
  assert.equal(o.serviceSchedules[0].id, 'direction:privacy_film');
  assert.deepEqual(approved(o), ['direction:privacy_film', 'line:q'], 'what the client approved stays approved');
});

test('a closed project whose work has paid stages keeps its direction, so pay is not counted twice', () => {
  const ctx = sandbox();
  const o: any = {
    id: 'st', status: 'completed', serviceType: 'solar_film', serviceTypes: ['solar_film'],
    measurements: { rooms: [{ id: 'r', windows: [{ id: 'a', measureScope: 'solar_film', catalogId: 'solar1', width: 1000, height: 1000, qty: 1 }] }] },
    extraServices: [],
    productionStages: [{ id: 'st1', serviceId: 'direction:solar_film', status: 'done', installerIds: ['i1'] }],
  };
  const revenue = ctx.orderRevenue(o);
  const result = ctx.projectDirectionMoveApply(o, 'solar_film', 'privacy_film', 'owner');
  assert.equal(result.skipped, 'has_stages');
  assert.equal(o.serviceType, 'solar_film');
  assert.equal(o.measurements.rooms[0].windows[0].measureScope, 'solar_film');
  assert.equal(o.productionStages[0].serviceId, 'direction:solar_film');
  assert.equal(ctx.orderRevenue(o), revenue);
  assert.match(ctx.projectDirectionSkipNote(result), /этапы с начислениями/);
});

test('the bulk fix never merges finished work into a direction the project already has', () => {
  const ctx = sandbox();
  const o: any = wizProject('m', {
    serviceType: 'solar_film', serviceTypes: ['solar_film', 'decorative_film'],
    measurements: { rooms: [{ id: 'r', windows: [
      { id: 'a', measureScope: 'solar_film', catalogId: 'solar1', width: 1000, height: 1000, qty: 1 },
      { id: 'b', measureScope: 'decorative_film', catalogId: 'solar1', width: 1000, height: 1000, qty: 1 },
    ] }] },
    extraServices: [],
    serviceSchedules: [{ id: 'direction:solar_film', installerIds: ['i1'] }, { id: 'direction:decorative_film', installerIds: ['i2'] }],
  });
  ctx.db.orders.push(o);
  const revenueBefore = ctx.orderRevenue(o);
  const result = ctx.wizDirectionBulkMove(['m'], 'privacy_film', 'owner', { wantSkipped: true });
  assert.deepEqual({ ...result }, { projects: 0, skipped: 1 });
  const ids = o.serviceSchedules.map((plan: any) => plan.id);
  assert.equal(new Set(ids).size, ids.length, 'no two crews under one service');
  assert.deepEqual(ids.sort(), ['direction:decorative_film', 'direction:privacy_film']);
  assert.equal(o.measurements.rooms[0].windows[1].measureScope, 'decorative_film', 'the second direction is left for the owner');
  assert.equal(ctx.orderRevenue(o), revenueBefore);
});

test('a project that already has the right direction gets a history entry from the bulk fix', () => {
  const ctx = sandbox();
  const o: any = wizProject('ok', { serviceType: 'privacy_film', serviceTypes: ['privacy_film'] });
  o.measurements.rooms[0].windows[0].measureScope = 'privacy_film';
  ctx.db.orders.push(o);
  assert.equal(ctx.wizDirectionBulkMove(['ok'], 'privacy_film', 'owner'), 1);
  const entry = o.timeline.at(-1);
  assert.equal(entry.key, 'direction_checked');
  assert.equal(entry.by, 'owner');
  assert.match(entry.note, /^Направление проверено: Приватная плёнка · массовая правка импорта TintWiz/);
  assert.ok(o._directionCheckedAt);
});

test('the server keeps the client approvals of a closed project whose direction the owner moved', () => {
  const solar = () => ({
    id: 'srv', status: 'completed', serviceType: 'solar_film',
    measurements: { rooms: [{ id: 'r', windows: [{ id: 'w', name: 'Импорт', width: 2000, height: 2000, qty: 1, catalogId: 'solar1', filmType: 'Solar 20' }] }] },
    extraServices: [{ id: 'l', type: 'custom', qty: 1, price: 7500 }],
  });
  const moved = (order: any) => {
    const next = structuredClone(order);
    next.serviceType = 'privacy_film'; next.serviceTypes = ['privacy_film'];
    next.measurements.rooms[0].windows[0].measureScope = 'privacy_film';
    next.extraServices[0].serviceType = 'privacy_film';
    return next;
  };
  const both = (order: any) => ['direction:privacy_film', 'line:l'].map(id => serviceScopeApproved(order, id));
  // First save after the move: the project had no approvals yet.
  const before = solar(), next = moved(before);
  assert.equal(prepareServiceScopeApprovals({ orders: [before] }, { orders: [next] }, true, [], 'owner'), null);
  assert.deepEqual(both(next), [true, true]);
  // A project that already had approvals for the old direction.
  const approved = solar();
  assert.equal(prepareServiceScopeApprovals({ orders: [solar()] }, { orders: [approved] }, true, [], 'owner'), null);
  assert.equal(serviceScopeApproved(approved, 'direction:solar_film'), true);
  const again = moved(approved);
  assert.equal(prepareServiceScopeApprovals({ orders: [approved] }, { orders: [again] }, true, [], 'owner'), null);
  assert.deepEqual(both(again), [true, true]);
  // A move does not carry a size change past the client's approval.
  const resized = moved(approved);
  resized.measurements.rooms[0].windows[0].width = 3000;
  assert.equal(prepareServiceScopeApprovals({ orders: [approved] }, { orders: [resized] }, true, [], 'owner'), null);
  assert.equal(serviceScopeApproved(resized, 'direction:privacy_film'), false);
  assert.equal(serviceScopeApproved(resized, 'line:l'), true);
});
