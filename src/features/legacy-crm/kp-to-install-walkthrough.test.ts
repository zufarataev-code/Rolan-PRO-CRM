import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-10-25: «пройди в CRM полный цикл от КП до назначения монтажа».
// What the walkthrough on production found, and what now holds.
const html = readFileSync('private/legacy/rolanpro-crm-cloud.html', 'utf8');
const stages = readFileSync('private/legacy/production-stages.js', 'utf8');
const service = readFileSync('src/features/proposals/service.ts', 'utf8');
const serializers = readFileSync('src/features/proposals/serializers.ts', 'utf8');
const pkg = readFileSync('src/components/public-proposal-package.tsx', 'utf8');
const payUi = readFileSync('src/components/public-payment-options.tsx', 'utf8');
const view = readFileSync('src/components/client-proposal-view.tsx', 'utf8');
const fn = (src: string, name: string) => { const a = src.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return src.slice(a, src.indexOf('\n}\n', a) + 3); };

test('options the client ticks keep the signed estimate approved; a monthly one is a subscription', () => {
  const apply = stages.slice(stages.indexOf('async function premiumApplyClientOptions('));
  assert.match(apply.slice(0, 4000), /if \(item\.dynamic_fields\.billing === 'monthly'\) \{[\s\S]*?fresh\.subscriptions\.push/);
  assert.match(apply.slice(0, 4000), /if \(added && \(wasApproved \|\| projectProposalAccepted\(fresh\)\)\) projectReapproveEstimate\(fresh, 'Клиент выбрал опции в КП'\);/);
  assert.match(fn(stages, 'projectReapproveEstimate'), /o\.projectEstimateFingerprint = projectEstimatePriceFingerprint\(o\);/);
});

test('production says how to fix what blocks it: approve the estimate, order the film', () => {
  const modal = fn(html, 'openProjectProductionWorkspace');
  assert.match(modal, /projectReapproveEstimateFromProduction\('\$\{o\.id\}'\)/);
  assert.match(modal, /projectOrderShortFilm\('\$\{o\.id\}','\$\{catalogId\}'\)">Заказать плёнку под проект/);
  assert.match(fn(html, 'projectProductionReadiness'), /if \(!stock\.enough && !activeProjectFilmPurchaseRequest\(o\.id, catalogId\)\) issues\.push/);
  const order = fn(stages, 'projectOrderShortFilm');
  assert.match(order, /source: 'project_production_shortage'/);
  assert.match(order, /db\.purchaseRequests\.push\(request\);/);
});

test('a deposit is recorded after the client signs; the CRM sees the method the client chose', () => {
  const pay = service.slice(service.indexOf('export async function markDepositPaid('));
  assert.match(pay.slice(0, 1500), /if \(!isProposalPublicLocked\(deposit\.proposal\.status\)\) \{/);
  assert.match(serializers, /payment_method: deposit\.payment_method \?\? null,/);
});

test('the client page leads to the payment and spells out Zelle; a monthly option shows its price', () => {
  assert.ok(pkg.indexOf('<div id="proposal-payment">') < pkg.indexOf('<PublicWarrantySummary'));
  assert.match(pkg, /getElementById\("proposal-payment"\)\?\.scrollIntoView/);
  assert.match(payUi, /В комментарии укажите: /);
  assert.match(view, /fields\?\.billing === "monthly" && Number\(fields\.monthly_price\) > 0/);
});

test('the cashier hides options without a price; the estimate opens the KP window, not the old studio', () => {
  assert.match(fn(html, 'serviceOfferingsFor'), /!\(item\.proposalOptional && !\(Number\(item\.pricePerSqft\) > 0\)\)/);
  assert.match(fn(html, 'serviceCashierOfferingMeta'), /offering\.monthly \? 'мес'/);
  assert.match(fn(html, 'approveProjectEstimateAndOpenProposal'), /state\._proposalWizard = \{ oid, step: 'preview', pending: true \};/);
  assert.doesNotMatch(html, /Zelle на Chase/);
});

test('a paid deposit thanks the client instead of asking again; a missed server mark is retried', () => {
  assert.match(payUi, /Deposit received: /);
  assert.match(fn(stages, 'premiumApplyServerProposalState'), /if \(o\.depositReceived && dep\?\.deposit_id && dep\.status !== 'paid' && typeof syncServerDepositPaid === 'function'\)/);
});
