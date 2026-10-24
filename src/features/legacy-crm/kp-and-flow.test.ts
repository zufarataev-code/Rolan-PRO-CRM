import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Owner, 2026-10-23 (second end-to-end pass): the KP had no technical drawing,
// counted sq ft as windows and mixed Russian into the client's English, the
// CRM asked a different deposit than the KP, services had two ways in, and
// scheduling the installation was not one click away.

const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
type Row = Record<string, any>;

function slice(source: string, from: string, to: string) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `slice ${from}`);
  return source.slice(start, end);
}

test('every KP window carries its drawing: inches, type and panes in rows or columns', () => {
  const panelsOf: Record<string, Row[]> = {
    sh: [{ width: 1828.8, height: 762 }, { width: 1828.8, height: 762 }],
    sl: [{ width: 457.2, height: 1219.2 }, { width: 457.2, height: 1219.2 }],
    pic: [{ width: 2438.4, height: 1016 }],
  };
  const c: any = vm.createContext({
    console,
    measureWindowPanels: (w: Row) => panelsOf[w.winType],
    winTypeInfo: (key: string) => ({ label: ({ sh: 'Single hung / вертикальное', sl: '2 sashes', pic: 'Picture' } as Row)[key] }),
  });
  vm.runInContext(slice(html, 'function premiumWindowDrawingData(win)', 'function projectProposalItemsFromEstimate('), c);
  const sh = c.premiumWindowDrawingData({ winType: 'sh', width: 1828.8, height: 1524 });
  assert.deepEqual([sh.width_in, sh.height_in, sh.window_type, sh.panel_layout, sh.panels.length], [72, 60, 'Single hung', 'rows', 2]);
  assert.equal(c.premiumWindowDrawingData({ winType: 'sl', width: 914.4, height: 1219.2 }).panel_layout, 'columns');
  assert.equal(c.premiumWindowDrawingData({ winType: 'pic', width: 2438.4, height: 1016 }).panel_layout, 'single');
  assert.match(slice(html, 'function projectProposalItemsFromEstimate(order, prop, calc)', 'function premiumCanonicalSnapshot(prop)'), /\.\.\.premiumWindowDrawingData\(win\)/);
});

test('the client reads the film in English: brand, series, model', () => {
  const c: any = vm.createContext({
    console,
    catalogFilmName: (f: Row) => f.name,
    catalogFilmModel: (f: Row) => f.model,
    catalogLabel: () => 'Солнцезащитная · Sunscape Select · 15',
  });
  vm.runInContext(slice(html, 'function premiumCatalogTitleEn(c)', 'function projectLineMaterialNames('), c);
  assert.equal(c.premiumCatalogTitleEn({ brand: 'Madico', name: 'Sunscape Select', model: '15' }), 'Madico Sunscape Select 15');
  const builder = slice(html, 'function projectProposalItemsFromEstimate(order, prop, calc)', 'function premiumCanonicalSnapshot(prop)');
  assert.match(builder, /premiumCatalogTitleEn\(catalog\)/);
  assert.match(builder, /Math\.round\(premiumNum\(quantity\) \* 100\) \/ 100\} sq ft/);
});

test('the client KP draws the windows and counts openings, not square feet', async () => {
  (globalThis as any).React = React;
  const { ClientProposalView } = await import('../../components/client-proposal-view');
  const items = [
    { proposal_item_id: 'a', client_selected: true, room_name: 'Гостиная', title_en: 'Solar Window Film — Madico Sunscape Select 15', line_price: 630, quantity: 42, unit_label: 'sq ft',
      measurement_snapshot: { windows: [
        { window_id: 'w1', window_name: 'Окно 1', quantity: 1, sqft: 30, width_in: 72, height_in: 60, window_type: 'Single hung', panels: [{ width_in: 72, height_in: 30 }, { width_in: 72, height_in: 30 }], panel_layout: 'rows' },
        { window_id: 'w2', window_name: 'Window 2', quantity: 2, sqft: 24, width_in: 36, height_in: 48, panels: [{ width_in: 18, height_in: 48 }, { width_in: 18, height_in: 48 }], panel_layout: 'columns' },
      ] } },
    { proposal_item_id: 'b', client_selected: true, title_en: 'Structural Silicone', line_price: 270, quantity: 54, unit_label: 'lin ft' },
  ];
  const markup = renderToStaticMarkup(React.createElement(ClientProposalView as any, { initialProposal: { status: 'sent', client: { name: 'Michael Brown' }, items } }));
  assert.equal((markup.match(/class="proposal-window-drawing"/g) || []).length, 2);
  assert.match(markup, /72″/);
  assert.match(markup, /3 windows/, 'two windows, one of them ×2');
  assert.doesNotMatch(markup, /42 windows|96 windows/);
  assert.match(markup, /<b>Window 1<\/b>/, 'window names in the client language');
  assert.match(markup, /Living room/);
  assert.doesNotMatch(markup, /Гостиная/);
});

test('the deposit the CRM asks for is the one the KP asks the client to pay', () => {
  const order: Row = { id: 'o', payments: [] };
  const c: any = vm.createContext({
    console,
    db: { settings: { advancePct: 30 } },
    orderRevenue: () => 900,
    getPremiumProposalByOrder: () => ({ token: 't' }),
    premiumProposalCalc: () => ({ paymentDue: 90.0168 }),
  });
  vm.runInContext(slice(html, 'function orderPayments(o)', 'function renderPaymentsDue('), c);
  assert.equal(c.orderExpectedDeposit(order), 90.02);
  c.getPremiumProposalByOrder = () => null;
  assert.equal(c.orderExpectedDeposit(order), 270, 'no KP yet: the advance % from settings');
});

test('one way to add a service; scheduling and acceptance are one clear step each', () => {
  assert.match(slice(stages, 'function projectDirectionOfferingPickerHtml(o, directionKey)', 'function projectLineNoteValue('), /openServiceCashier\('\$\{o\.id\}','card'\);serviceCashierPick\('direction','\$\{directionKey\}'\)/);
  assert.doesNotMatch(stages, /<select class="project-direction-add"/);
  assert.match(html, /\+ Своя строка<\/button>/);
  const next = slice(html, 'function orderPrimaryNextAction(o)', 'function installerOrderPrimaryAction(o)');
  assert.match(next, /title: 'Назначить монтаж'[^\n]*scheduleInstallationPrompt/);
  assert.match(next, /installation_scheduled: 'Монтаж назначен'/);
  assert.match(next, /if \(confirm\('Клиент подтвердил КП/);
  assert.match(html, /function projectScheduleCopyFirstToAll\(\)/);
  assert.match(html, /Та же дата и бригада для всех услуг/);
  assert.match(slice(stages, 'function projectSetServiceProgress(oid, key, status)', 'function projectLineDirectionInfo('), /projectConfirmServicesDone\(o, \[line\]\)/, 'the stage-aware override warns too');
});

test('panes keep hundredths of a millimetre, so 36×48 in is 12 sq ft, not 12.0079', () => {
  const panels = slice(html, 'function measureDefaultPanels', '\n}\n');
  assert.match(panels, /Math\.round\(height \/ 2 \* 100\) \/ 100/);
  assert.match(panels, /Math\.round\(width \/ count \* 100\) \/ 100/);
});

test('deposit rule: 10% of the project, never more than $1 000 (Owner, 2026-10-24)', () => {
  const settings: Row = { advancePct: 10, depositCapUsd: 1000 };
  const c: any = vm.createContext({ console, db: { settings }, fmtMoney: (v: number) => `$${v}` });
  vm.runInContext(slice(html, 'function companyDepositPct()', 'function orderExpectedDeposit('), c);
  assert.equal(c.companyDepositFor(630), 63);
  assert.equal(c.companyDepositFor(25000), 1000, 'capped');
  assert.equal(c.companyDepositLabel(), '10%, не больше $1000');
  assert.match(html, /if \(!s\._depositPolicy20261024\) \{ s\.advancePct = 10; s\.depositCapUsd = 1000;/);
  assert.doesNotMatch(html, /advancePct \|\| 30|advancePct\|\|30/, 'no hard-coded 30% left');
});
