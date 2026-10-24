import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Owner, 2026-10-24: «единый справочник, где мы будем писать все ставки, чтобы у
// нас был единый источник правды». Installer pay comes from the service in
// «Услуги и цены» — one rate for every installer; company-wide rates sit in the
// same directory.

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
type Row = Record<string, any>;

function slice(from: string, to: string) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return html.slice(start, end);
}

function rates(settings: Row, offerings: Row[]) {
  const c: any = vm.createContext({
    console,
    db: { settings },
    serviceOffering: (id: string) => offerings.find(o => o.id === id),
    windowCatalog: (w: Row) => w.catalog,
    canonicalCatalogCategory: (v: string) => v,
    filmRate: () => 2.5,
    windowActualAreaSqft: (w: Row) => w.sqft,
    getCatalogItem: () => null,
    primaryServiceInfo: () => null,
    canonicalServiceCodeForOrderService: () => '',
  });
  vm.runInContext(slice('function installerServiceCodeByCategory(category)', 'function syncLegacyInstallerServiceRate('), c);
  vm.runInContext(slice('function serviceOfferingInstallerRate(line)', '\n}\n') + '\n}\n', c);
  vm.runInContext(slice('function windowServiceInstallerRate(w)', 'function orderQuickInstallerPayoutForUser('), c);
  return c;
}

test('a window of a directory service pays that service rate, the same for every installer', () => {
  const settings = { installerRates: { _defaults: { solar: 4.25 }, serviceTypes: { SOLAR_FILM: 4.25 } } };
  const c = rates(settings, [{ id: 'mag', installerRatePerSqft: 2.5 }, { id: 'a2', installerRatePerSqft: 0 }]);
  const expert = { payConfig: { type: 'per_sqft', ratePerSqft: 9, ratesByCategory: { solar: 9 } } };
  assert.equal(c.installerRateForWindow(expert, { offeringId: 'mag', sqft: 40 }), 2.5, 'no personal override');
  assert.equal(c.windowInstallerPayout({ offeringId: 'mag', sqft: 40 }), 100);
  assert.equal(c.installerRateForWindow(null, { offeringId: 'a2', sqft: 10 }), 0, 'an empty service rate is $0, not a hidden default');
  // A row made before the directory (no service) keeps the old direction rate.
  assert.equal(c.installerRateForWindow(null, { catalog: { category: 'solar', brand: 'X', model: 'Y' }, sqft: 10 }), 4.25);
});

test('migration writes the rate a service was silently paid into the service and flags it', () => {
  const block = slice('  // One rates directory (2026-10-24)', '  if (s.depositCapUsd == null)');
  const s: Row = {
    serviceOfferings: [
      { id: 'a2', direction: 'protective', pricePerSqft: 20, installerRatePerSqft: 0 },
      { id: 'mag', direction: 'solar', pricePerSqft: 15, installerRatePerSqft: 2.5 },
      { id: 'draft', direction: 'solar', pricePerSqft: 0 },
      { id: 'sil', direction: 'solar', unit: 'lft', pricePerSqft: 5, installerRatePerSqft: 0 },
    ],
  };
  const c: any = vm.createContext({ s, canonicalCatalogCategory: (v: string) => v, installerServiceRateByCategory: (cat: string) => ({ protective: 5.6, solar: 4.25 } as Row)[cat] });
  vm.runInContext(block, c);
  const [a2, mag, draft, sil] = s.serviceOfferings;
  assert.deepEqual([a2.installerRatePerSqft, a2.installerRateNeedsReview], [5.6, true], 'payout unchanged, owner asked to check');
  assert.equal(mag.installerRatePerSqft, 2.5);
  assert.equal(mag.installerRateNeedsReview, undefined);
  assert.equal(draft.installerRatePerSqft, undefined, 'drafts stay empty');
  assert.equal(sil.installerRatePerSqft, 0, 'lin ft / piece services never had a fallback');
  assert.equal(s._ratesDirectory20261024, true);
});

test('the directory shows company rates; personal and duplicate rate fields are gone', () => {
  const block = slice('function companyRatesBlockHtml(owner)', 'function renderCanonicalServicePricing()');
  assert.match(block, /Аванс, % от проекта/);
  assert.match(block, /Аванс не больше, \$/);
  assert.match(block, /Налог с прибыли проекта, %/);
  assert.match(block, /Комиссия: \$\{academyEsc\(u\.name\)\}, %/);
  assert.match(block, /u\.commissionPct = u\.payConfig\.commissionPct;/, 'one commission number');
  assert.match(html, /\$\{companyRatesBlockHtml\(owner\)\}/);
  assert.match(html, /перенесено из старых настроек — проверьте/);
  assert.match(html, /не заполнено — монтаж \$0/);
  assert.match(html, /if \(field === 'installerRatePerSqft'\) delete offering\.installerRateNeedsReview;/);
  assert.doesNotMatch(html, /id="pc-ratePerSqft"|id="pc-rate-\$\{cat\}"/);
  assert.doesNotMatch(html, /updateCatalogItem\('\$\{c\.id\}','installerRatePerSqft'/, 'no rate per film in the warehouse');
});
