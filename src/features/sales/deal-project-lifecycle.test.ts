import assert from "node:assert/strict";
import test from "node:test";

import { calculatePaymentAmount, PAYMENT_METHODS } from "@/features/payments/policy";
import { isSaleCloseReady } from "@/features/sales/close-sale";
import { getAllowedStageTransitions, isValidStageTransition } from "@/features/sales/pipeline";

test("sale closes only after both signed agreement and paid deposit", () => {
  const signedAt = new Date("2026-09-04T18:00:00.000Z");
  const paidAt = new Date("2026-09-04T18:05:00.000Z");

  assert.equal(
    isSaleCloseReady({
      agreementStatus: "signed",
      agreementSignedAt: signedAt,
      depositStatus: "paid",
      depositPaidAt: paidAt,
    }),
    true,
  );

  assert.equal(
    isSaleCloseReady({
      agreementStatus: "sent",
      agreementSignedAt: null,
      depositStatus: "paid",
      depositPaidAt: paidAt,
    }),
    false,
  );

  assert.equal(
    isSaleCloseReady({
      agreementStatus: "signed",
      agreementSignedAt: signedAt,
      depositStatus: "pending",
      depositPaidAt: null,
    }),
    false,
  );
});

test("sales pipeline ends at CLOSED_WON and cannot enter project execution statuses", () => {
  assert.deepEqual(getAllowedStageTransitions("DEPOSIT_PAID"), ["CLOSED_WON"]);
  assert.equal(isValidStageTransition("DEPOSIT_PAID", "PROJECT_CREATED"), false);
  assert.deepEqual(getAllowedStageTransitions("CLOSED_WON"), []);
  assert.deepEqual(getAllowedStageTransitions("PROJECT_CREATED"), []);
  assert.deepEqual(getAllowedStageTransitions("SCHEDULED"), []);
  assert.deepEqual(getAllowedStageTransitions("IN_PROGRESS"), []);
});

test("Zelle and bank transfer have no fee while online payment adds exactly 3.5 percent", () => {
  const base = 1000;
  const zelle = calculatePaymentAmount(base, PAYMENT_METHODS.ZELLE);
  const bank = calculatePaymentAmount(base, PAYMENT_METHODS.BANK_TRANSFER);
  const online = calculatePaymentAmount(base, PAYMENT_METHODS.PAYMENT_SYSTEM);

  assert.equal(zelle.fee_percent, 0);
  assert.equal(zelle.processing_fee, 0);
  assert.equal(zelle.payable_amount, 1000);

  assert.equal(bank.fee_percent, 0);
  assert.equal(bank.processing_fee, 0);
  assert.equal(bank.payable_amount, 1000);

  assert.equal(online.fee_percent, 3.5);
  assert.equal(online.processing_fee, 35);
  assert.equal(online.payable_amount, 1035);
});

test("payment fee calculation rounds to cents and never creates a negative payable amount", () => {
  const rounded = calculatePaymentAmount(1234.56, PAYMENT_METHODS.PAYMENT_SYSTEM);
  const negative = calculatePaymentAmount(-100, PAYMENT_METHODS.PAYMENT_SYSTEM);

  assert.equal(rounded.processing_fee, 43.21);
  assert.equal(rounded.payable_amount, 1277.77);
  assert.equal(negative.base_amount, 0);
  assert.equal(negative.processing_fee, 0);
  assert.equal(negative.payable_amount, 0);
});
