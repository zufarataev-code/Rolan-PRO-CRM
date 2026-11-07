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
