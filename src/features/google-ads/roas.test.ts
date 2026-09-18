import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

import {
  GoogleAdsRoasError,
  effectiveConversionRevenue,
  validateRoasRange,
} from "./roas";

test("ROAS revenue uses original conversion value when there is no adjustment", () => {
  assert.equal(effectiveConversionRevenue(new Prisma.Decimal("1500.00"), null)?.toFixed(2), "1500.00");
});

test("ROAS revenue uses RESTATEMENT as the new final value, not as a delta", () => {
  assert.equal(
    effectiveConversionRevenue(new Prisma.Decimal("1500.00"), {
      adjustment_type: "RESTATEMENT",
      adjusted_value: new Prisma.Decimal("900.00"),
    })?.toFixed(2),
    "900.00",
  );
});

test("ROAS revenue treats RETRACTION as zero", () => {
  assert.equal(
    effectiveConversionRevenue(new Prisma.Decimal("1500.00"), {
      adjustment_type: "RETRACTION",
      adjusted_value: null,
    })?.toFixed(2),
    "0.00",
  );
});

test("unknown original revenue remains unknown until explicitly restated", () => {
  assert.equal(effectiveConversionRevenue(null, null), null);
  assert.equal(
    effectiveConversionRevenue(null, {
      adjustment_type: "RESTATEMENT",
      adjusted_value: new Prisma.Decimal("400.00"),
    })?.toFixed(2),
    "400.00",
  );
});

test("ROAS date validation allows up to 366 days and rejects invalid ranges", () => {
  assert.equal(validateRoasRange("2026-09-01", "2026-09-11").days, 11);

  assert.throws(
    () => validateRoasRange("2026-09-12", "2026-09-11"),
    (error: unknown) => {
      assert.ok(error instanceof GoogleAdsRoasError);
      assert.equal(error.code, "invalid_date_range");
      return true;
    },
  );
});
