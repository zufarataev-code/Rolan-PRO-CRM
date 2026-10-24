import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-24, from the phone: no way back from the calculation and the KP,
// cashier steps stacked as full-width buttons, a long film list, a project form
// where it is hard to see what comes from where, and a second «Услуги» list on
// «Услуги и цены» that looked like a duplicate of the directions.

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const mobile = readFileSync('src/features/legacy-crm/mobile-workspace.ts', 'utf8');

function slice(from: string, to: string) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return html.slice(start, end);
}

test('the calculation and the KP studio have a visible way back to the project', () => {
  assert.match(slice('function openProjectEstimateWorkspace(oid)', '\nfunction '), /<button type="button" class="workspace-back" onclick="closeModal\(\)">← К проекту<\/button>/);
  assert.match(slice('function openPremiumProposalManagerModal(token)', 'async function newPremiumProposalVersion('), /class="workspace-back mb-2" onclick="closeModal\(\)">← \$\{state\.view === 'proposals' \? 'К списку КП' : 'К проекту'\}/);
});

test('on a phone the cashier steps are one row and the cashier keeps its own layout', () => {
  assert.match(html, /\.rp-cashier-crumbs \{ flex-wrap:nowrap !important;overflow-x:auto;/);
  assert.equal((mobile.match(/\.rp-cashier, \.rp-dirwin, \[data-rp-keep-layout\]/g) || []).length, 4, 'toolbar, stack, action-row and generic passes skip the cashier');
});

test('a long film list folds by series and «уточним на замере» comes first', () => {
  const material = slice("} else if (c.step === 'material') {", "} else {");
  assert.match(material, /const fold = films\.length > 8;/);
  assert.match(material, /<details class="rp-cashier-group rp-cashier-fold" \$\{list\.some\(film => film\.id === c\.catalogId\) \? 'open' : ''\}>/);
  assert.ok(material.indexOf('${skip}') < material.indexOf('[...groups.entries()]'), 'skip button above the series');
});

test('the calculation footer is one compact row on a phone', () => {
  assert.match(html, /\.project-estimate-footer > div:last-child \{\s*display: grid;\s*width: 100%;\s*grid-template-columns: auto 1fr;/);
  assert.match(html, /-webkit-line-clamp: 2;/);
});

test('the chosen client is one line; card details fold; one «Адрес объекта»', () => {
  const panel = slice('function renderOrderClientSelection(c)', '\nfunction ');
  assert.doesNotMatch(panel, /client-autofill-grid|Данные подтянуты из карточки клиента/);
  assert.match(panel, /<details class="order-client-more mt-2">/);
  assert.match(panel, /Адрес объекта <span class="order-required">\*<\/span>/);
  assert.match(panel, /addresses\.length > 1 \? `<select id="no-client-address"/, 'a select only when there is a choice');
  assert.match(panel, /warnings\.filter\(w => !\/старым форматом\/\.test\(w\)\)/);
  assert.match(html, /«\+ Услуга» → направление → услуга → плёнка \(можно «уточним на замере»\)/);
});

test('«Услуги и цены»: directions are the services; the old calculator price list is folded and named', () => {
  const page = slice('function renderCanonicalServicePricing()', 'async function loadCanonicalInstallerOperations(');
  const directions = page.indexOf('${renderServiceOfferingsSection()}');
  const folded = page.indexOf('<details class="card border border-slate-200 bg-white canonical-calculator-price"');
  assert.ok(directions > 0 && folded > directions);
  assert.match(page, /Прайс быстрого калькулятора/);
  assert.match(page, /В проекты, кассу и КП идут услуги из направлений выше\./);
  assert.ok(page.indexOf('Допработы калькулятора') > folded && page.indexOf('</div></details>') > page.indexOf('Допработы калькулятора'));
  assert.doesNotMatch(page, /<h2 class="text-xl font-black">Услуги<\/h2>/);
});
