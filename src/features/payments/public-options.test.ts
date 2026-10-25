import assert from "node:assert/strict";
import test from "node:test";

import { calculateSuggestedDeposit } from "./policy";

test("residential deposit follows the California 10% / $1,000 cap", () => {
  assert.equal(calculateSuggestedDeposit(2_920, "residential"), 292);
  assert.equal(calculateSuggestedDeposit(25_000, "residential"), 1_000);
});

test("commercial proposal follows the same 10% / $1,000 rule", () => {
  assert.equal(calculateSuggestedDeposit(12_000, "commercial"), 1_000, "one rule for commercial too: 10%, at most $1 000");
});

test("invalid totals never produce a payable deposit", () => {
  assert.equal(calculateSuggestedDeposit(-100, "residential"), 0);
  assert.equal(calculateSuggestedDeposit(Number.NaN, "commercial"), 0);
});

test("Zelle details come from the CRM settings when the server env has none (Owner, 2026-10-24)", async () => {
  const { paymentInstructionsFromSettings } = await import("./public-options");
  const crm = { zelleRecipient: "zufarast@gmail.com", zelleRecipientName: "ROLANPRO LLC", zelleEnabled: true };
  assert.equal(paymentInstructionsFromSettings(crm, { zelle: null, bank: null }).zelle_recipient, "zufarast@gmail.com (ROLANPRO LLC)");
  assert.equal(paymentInstructionsFromSettings({ ...crm, zelleEnabled: false }, { zelle: null, bank: null }).zelle_recipient, null);
  assert.equal(paymentInstructionsFromSettings(crm, { zelle: "env@x", bank: null }).zelle_recipient, "env@x", "the env still wins");
});

test("bank transfer details come from «Банковский перевод» in CRM settings (achInstructions)", async () => {
  const { paymentInstructionsFromSettings } = await import("./public-options");
  const crm = { achEnabled: true, achInstructions: "Bank: Chase\nAccount name: ROLANPRO LLC" };
  assert.equal(paymentInstructionsFromSettings(crm, { zelle: null, bank: null }).bank_transfer_instructions, "Bank: Chase\nAccount name: ROLANPRO LLC");
  assert.equal(paymentInstructionsFromSettings({ ...crm, achEnabled: false }, { zelle: null, bank: null }).bank_transfer_instructions, null);
  assert.equal(paymentInstructionsFromSettings(crm, { zelle: null, bank: "env bank" }).bank_transfer_instructions, "env bank");
});

test("the card fee passed to the client is 3%; Zelle and bank transfer are free", async () => {
  const { calculatePaymentAmount, PAYMENT_METHODS, PAYMENT_SYSTEM_FEE_PERCENT } = await import("./policy");
  assert.equal(PAYMENT_SYSTEM_FEE_PERCENT, 3);
  assert.equal(calculatePaymentAmount(1000, PAYMENT_METHODS.PAYMENT_SYSTEM).payable_amount, 1030);
  assert.equal(calculatePaymentAmount(1000, PAYMENT_METHODS.ZELLE).payable_amount, 1000);
});
