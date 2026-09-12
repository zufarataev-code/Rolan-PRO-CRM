import assert from "node:assert/strict";
import test from "node:test";

import {
  ConversionAdjustmentValidationError,
  normalizeAdjustmentCurrency,
  normalizeConversionAdjustmentDraft,
} from "./conversion-adjustments";

function expectValidationError(fn: () => unknown, code: string) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ConversionAdjustmentValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("RETRACTION rejects adjusted_value", () => {
  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "refund-1",
        adjustmentType: "RETRACTION",
        adjustedValue: "0",
      }),
    "retraction_value_forbidden",
  );
});

test("RESTATEMENT requires a non-negative final adjusted value", () => {
  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "refund-2",
        adjustmentType: "RESTATEMENT",
      }),
    "restatement_value_required",
  );

  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "refund-2",
        adjustmentType: "RESTATEMENT",
        adjustedValue: "-0.01",
      }),
    "invalid_adjusted_value",
  );
});

test("RESTATEMENT keeps the supplied value as the new final value without delta math", () => {
  const normalized = normalizeConversionAdjustmentDraft({
    financialReferenceId: "refund-3",
    adjustmentType: "RESTATEMENT",
    adjustedValue: "1250.50",
    currency: "usd",
  });

  assert.equal(normalized.adjustedValue?.toFixed(2), "1250.50");
  assert.equal(normalized.currency, "USD");
});

test("only RETRACTION and RESTATEMENT are accepted", () => {
  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "refund-4",
        adjustmentType: "ENHANCEMENT",
      }),
    "invalid_adjustment_type",
  );
});

test("currency normalization requires exactly three letters", () => {
  assert.equal(normalizeAdjustmentCurrency(" usd "), "USD");
  assert.equal(normalizeAdjustmentCurrency(undefined), null);
  expectValidationError(() => normalizeAdjustmentCurrency("US"), "invalid_currency");
  expectValidationError(() => normalizeAdjustmentCurrency("U1D"), "invalid_currency");
});

test("financial reference is mandatory and bounded", () => {
  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "   ",
        adjustmentType: "RETRACTION",
      }),
    "financial_reference_required",
  );

  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "x".repeat(192),
        adjustmentType: "RETRACTION",
      }),
    "financial_reference_too_long",
  );
});
