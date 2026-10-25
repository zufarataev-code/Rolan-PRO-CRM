import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public card payment redirects to Stripe and verifies the returned session server-side", () => {
  const component = readFileSync("src/components/public-payment-options.tsx", "utf8");
  const checkout = readFileSync("src/features/payments/stripe-checkout.ts", "utf8");
  const page = readFileSync("app/proposal/[accessToken]/page.tsx", "utf8");
  const options = readFileSync("src/features/payments/public-options.ts", "utf8");

  assert.match(component, /window\.location\.assign\(checkout\)/);
  assert.match(checkout, /session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.match(page, /reconcilePublicStripeCheckout\(accessToken, sessionId\)/);
  assert.match(options, /paymentStatus === "paid"/);
  assert.match(options, /input\.metadata\.deposit_id === expected\.depositId/);
  assert.match(options, /payment_reference: checkoutSessionId/);
});

test("invoice Stripe links are polled and become real CRM payments exactly once", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(html, /\(o\.invoices \|\| \[\]\)\.some\(inv => inv\.paymentLinkId && !inv\.paidAt\)/);
  assert.match(html, /inv\.paidAt = paidAt/);
  assert.match(html, /addOrderPayment\(o\.id/);
  assert.match(html, /invoice_paid/);
});
