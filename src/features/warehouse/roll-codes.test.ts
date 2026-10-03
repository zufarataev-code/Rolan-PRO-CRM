import assert from "node:assert/strict";
import test from "node:test";

import { formatRollCode, rollCodePeriod } from "./roll-codes";

test("roll codes are RP-YYMM-NNNN by the month of receipt", () => {
  assert.equal(rollCodePeriod("2026-10-02"), "2610");
  assert.equal(rollCodePeriod("not a date", new Date("2027-01-15T12:00:00Z")), "2701");
  assert.equal(formatRollCode("2610", 7), "RP-2610-0007");
  assert.equal(formatRollCode("2610", 12345), "RP-2610-12345");
});
