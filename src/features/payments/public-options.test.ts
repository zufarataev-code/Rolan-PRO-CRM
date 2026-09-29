import assert from "node:assert/strict";
import test from "node:test";

import { calculateSuggestedDeposit } from "./policy";

test("residential deposit follows the California 10% / $1,000 cap", () => {
  assert.equal(calculateSuggestedDeposit(2_920, "residential"), 292);
  assert.equal(calculateSuggestedDeposit(25_000, "residential"), 1_000);
});

test("commercial proposal defaults to a 50% deposit", () => {
  assert.equal(calculateSuggestedDeposit(12_000, "commercial"), 6_000);
});

test("invalid totals never produce a payable deposit", () => {
  assert.equal(calculateSuggestedDeposit(-100, "residential"), 0);
  assert.equal(calculateSuggestedDeposit(Number.NaN, "commercial"), 0);
});
