import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner, 2026-11-06 («дай визуал, как клиент видит»): the payment and warranty
// sections after the proposal document had no styles at all — they inherited the
// dark landing text colour on a light page and «Pay for your project» was nearly
// invisible to the client.
const css = readFileSync('app/proposal-premium.css', 'utf8');

test('the payment and warranty sections are styled as part of the proposal document', () => {
  assert.match(css, /\.proposal-page-shell \.proposal-section \{[^}]*color: var\(--rp-ink\);/);
  assert.match(css, /\.proposal-page-shell \.proposal-section-kicker \{/);
  assert.match(css, /\.proposal-page-shell \.proposal-section h2 \{[^}]*color: var\(--rp-navy\);/);
  assert.match(css, /\.proposal-page-shell \.proposal-payment-section button \{[^}]*background: var\(--rp-blue\);/);
  assert.match(css, /\.proposal-page-shell \.proposal-payment-section button:disabled \{[^}]*cursor: not-allowed;/);
});

test('a selected card payment shows one main «Pay $X by card» button into Stripe, not «Selected» plus a small link', () => {
  const ui = readFileSync('src/components/public-payment-options.tsx', 'utf8');
  assert.match(ui, /className="proposal-pay-link"/);
  assert.match(ui, /`Pay \$\{formatMoney\(option\.payable_amount, data\.currency\)\} by card →`/);
  assert.match(ui, /!paid && !\(selected && option\.method === "payment_system" && option\.payment_link\) \?/);
  assert.match(css, /\.proposal-payment-section \.proposal-pay-link \{[^}]*background: var\(--rp-navy\);/);
});
