import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// #577 (Owner, 2026-11-21): «Новый проект» and the project card fit one screen on a
// big monitor, services are added with one small button, and a phone never scrolls
// sideways. The browser check is e2e/project-intake-layout.browser.ts.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const mobile = readFileSync('src/features/legacy-crm/mobile-workspace.ts', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };
const modal = html.slice(html.indexOf('function openOrderModal()'), html.indexOf('function offeringServiceType('));

test('the new-project window has client and object on the left, services and the manager on the right', () => {
  assert.doesNotMatch(modal, /erp-intake-main-grid" style="grid-template-columns:minmax\(0,1fr\)"/, 'no inline single column');
  const left = modal.indexOf('data-intake-col="client"');
  const right = modal.indexOf('data-intake-col="services"');
  assert.ok(left > 0 && right > left);
  for (const marker of ['data-intake-client', 'data-intake-site']) assert.ok(modal.indexOf(marker) > left && modal.indexOf(marker) < right, marker);
  for (const marker of ['data-intake-wait', 'data-intake-offering', 'data-new-order-after-client']) assert.ok(modal.indexOf(marker) > right, marker);
  assert.match(html, /@media \(min-width: 1280px\) \{\n {4}\.modal-content\.workspace-modal\.erp-intake-modal \{ width: min\(1440px, 96vw\); max-width: 1440px; \}\n {4}\.erp-intake-main-grid\.erp-intake-columns \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
  assert.ok(html.indexOf('width: min(1440px, 96vw)') > html.indexOf('width: min(1280px, 96vw)'), 'the wide rule comes after the 841px rule, so it wins');
  assert.match(fn(html, 'refreshOrderIntakeGates'), /\[data-intake-wait\]'\)\.forEach\(node => \{ node\.style\.display = hasSite \? 'none' : ''; \}\)/);
});

test('the object type is a compact segmented switch, and «+ Услуга» is a small button', () => {
  assert.match(modal, /<div class="erp-intake-segment mt-1" id="no-site-type-buttons" role="group"/);
  assert.match(modal, /class="erp-intake-segment-option" data-site-type="RESIDENTIAL"/);
  assert.match(modal, /class="erp-intake-segment-option" data-site-type="COMMERCIAL"/);
  assert.doesNotMatch(modal, /class="order-service-card" style="min-height:58px/);
  assert.match(html, /\.erp-intake-segment-option\.active \{/);
  assert.match(html, /\.erp-intake-modal button\[aria-label\^="Убрать"\] \{ white-space: nowrap; flex-shrink: 0; \}/, 'a narrow phone row never breaks «Убрать» into two lines');
  assert.match(fn(html, 'renderNewOrderOfferings'), /class="btn-ghost text-sm mt-2 rp-intake-add" data-intake-offering="add" onclick="openServiceCashier\('', 'intake'\)">\+ Услуга</);
});

test('an empty project shows no big «Добавить услуги проекта» bar; other next steps stay one compact row', () => {
  assert.match(html, /if \(!projectHasServices\(o\)\) return \{ key: 'add_services', icon: '🧩', title: 'Добавить услуги проекта'/);
  assert.match(fn(stages, 'projectFeedHtml'), /const primary = ctx\.primary\?\.key === 'add_services' \? null : ctx\.primary;/);
  assert.match(html, /\.project-feed-next \.order-action-card \{ max-height:44px; overflow:hidden; \}/);
});

test('from 1600px the project card is two columns with «Состав проекта» on the right', () => {
  assert.match(html, /@media \(min-width:1600px\) \{\n {4}html body \.order-clean-shell:has\(> \.project-feed\) \{ grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.15fr\);/);
  assert.match(html, /\.order-clean-shell:has\(> \.project-feed\) > \.project-feed \{ display:contents; \}/);
  assert.match(html, /\.order-clean-shell:has\(> \.project-feed\) > \.project-feed > \.project-feed-services \{ grid-column:2; grid-row:1 \/ 7; \}/);
  assert.match(html, /\.order-clean-shell:has\(> \.project-feed\) \.order-clean-stage-btn-hint \{ display:none; \}/, 'compact stage strip');
});

test('phones clip sideways overflow and fields never outgrow their box', () => {
  assert.match(mobile, /@supports \(overflow-x: clip\) \{\n\s*body \{ overflow-x: clip !important; \}/);
  assert.match(mobile, /input,\n\s*select,\n\s*textarea \{\n\s*max-width: 100% !important;/);
  assert.match(mobile, /\.erp-intake-col,\n\s*\.erp-intake-card,/);
});

test('CI opens the real CRM at 1920, 1440, 390 and 375 and checks the layout', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /run: node --import tsx e2e\/project-intake-layout\.browser\.ts/);
  const e2e = readFileSync('e2e/project-intake-layout.browser.ts', 'utf8');
  assert.match(e2e, /\{width: 1920, height: 1080\}, \{width: 1440, height: 900\}, \{width: 390, height: 844\}, \{width: 375, height: 812\}/);
  assert.match(e2e, /scrolls sideways/);
});
