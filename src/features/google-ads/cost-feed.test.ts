import assert from "node:assert/strict";
import test from "node:test";

import {
  GoogleAdsCostFeedError,
  buildGoogleAdsCostQuery,
  costMicrosToDecimal,
  flattenGoogleAdsCostStream,
  validateCostImportRange,
} from "./cost-feed";

test("cost query selects exact daily campaign spend fields", () => {
  const query = buildGoogleAdsCostQuery("2026-09-01", "2026-09-11");
  assert.match(query, /segments\.date/);
  assert.match(query, /campaign\.id/);
  assert.match(query, /campaign\.name/);
  assert.match(query, /customer\.currency_code/);
  assert.match(query, /metrics\.cost_micros/);
  assert.match(query, /metrics\.clicks/);
  assert.match(query, /metrics\.impressions/);
  assert.match(query, /BETWEEN '2026-09-01' AND '2026-09-11'/);
  assert.match(query, /campaign\.status != 'REMOVED'/);
});

test("cost import range rejects invalid, reversed and oversized ranges", () => {
  assert.equal(validateCostImportRange("2026-09-01", "2026-09-11").days, 11);

  for (const [start, end, code] of [
    ["09/01/2026", "2026-09-11", "invalid_date"],
    ["2026-09-12", "2026-09-11", "invalid_date_range"],
    ["2026-08-01", "2026-09-11", "date_range_too_large"],
  ] as const) {
    assert.throws(
      () => validateCostImportRange(start, end),
      (error: unknown) => {
        assert.ok(error instanceof GoogleAdsCostFeedError);
        assert.equal(error.code, code);
        return true;
      },
    );
  }
});

test("micros convert to decimal currency exactly without float math", () => {
  assert.equal(costMicrosToDecimal(1n).toFixed(6), "0.000001");
  assert.equal(costMicrosToDecimal(1_234_567n).toFixed(6), "1.234567");
  assert.equal(costMicrosToDecimal(9_999_999_999n).toFixed(6), "9999.999999");
});

test("SearchStream chunks flatten into rows", () => {
  const rows = flattenGoogleAdsCostStream([
    { results: [{ campaign: { id: "1", name: "A" } }] },
    { results: [{ campaign: { id: "2", name: "B" } }] },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.campaign?.id, "1");
  assert.equal(rows[1]?.campaign?.id, "2");
});

test("SearchStream parser rejects non-array response", () => {
  assert.throws(
    () => flattenGoogleAdsCostStream({ results: [] }),
    (error: unknown) => {
      assert.ok(error instanceof GoogleAdsCostFeedError);
      assert.equal(error.code, "invalid_google_response");
      return true;
    },
  );
});
