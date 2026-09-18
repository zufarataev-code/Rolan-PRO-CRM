import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustmentRetryDelayMs,
  buildGoogleAdsAdjustmentRequest,
  formatGoogleAdsAdjustmentDateTime,
  hasGoogleAdsPartialFailure,
  isRetryableAdjustmentStatus,
} from "./conversion-adjustment-uploader";

test("builds exact v25 RETRACTION request with order ID and validateOnly", () => {
  const payload = buildGoogleAdsAdjustmentRequest({
    customerId: "123-456-7890",
    actionId: "9988776655",
    originalTransactionId: "crm-deal-abc-sale",
    adjustmentType: "RETRACTION",
    adjustmentDateTime: new Date("2026-09-12T04:00:00.000Z"),
    validateOnly: true,
  });

  assert.deepEqual(payload, {
    conversionAdjustments: [
      {
        conversionAction: "customers/1234567890/conversionActions/9988776655",
        adjustmentType: "RETRACTION",
        orderId: "crm-deal-abc-sale",
        adjustmentDateTime: "2026-09-12 04:00:00+00:00",
      },
    ],
    partialFailure: true,
    validateOnly: true,
  });
});

test("builds RESTATEMENT using the supplied value as the new final value", () => {
  const payload = buildGoogleAdsAdjustmentRequest({
    customerId: "1234567890",
    actionId: "9988776655",
    originalTransactionId: "crm-deal-abc-sale",
    adjustmentType: "RESTATEMENT",
    adjustmentDateTime: new Date("2026-09-12T04:00:00.000Z"),
    adjustedValue: "1250.50",
    currency: "usd",
    validateOnly: false,
  });

  assert.deepEqual(payload, {
    conversionAdjustments: [
      {
        conversionAction: "customers/1234567890/conversionActions/9988776655",
        adjustmentType: "RESTATEMENT",
        orderId: "crm-deal-abc-sale",
        adjustmentDateTime: "2026-09-12 04:00:00+00:00",
        restatementValue: {
          adjustedValue: 1250.5,
          currencyCode: "USD",
        },
      },
    ],
    partialFailure: true,
    validateOnly: false,
  });
});

test("formats Google Ads adjustment timestamps with an explicit UTC offset", () => {
  assert.equal(
    formatGoogleAdsAdjustmentDateTime(new Date("2026-09-12T04:05:06.789Z")),
    "2026-09-12 04:05:06+00:00",
  );
});

test("classifies temporary adjustment upload failures for retry", () => {
  assert.equal(isRetryableAdjustmentStatus(408), true);
  assert.equal(isRetryableAdjustmentStatus(429), true);
  assert.equal(isRetryableAdjustmentStatus(500), true);
  assert.equal(isRetryableAdjustmentStatus(503), true);
  assert.equal(isRetryableAdjustmentStatus(400), false);
  assert.equal(isRetryableAdjustmentStatus(401), false);
  assert.equal(isRetryableAdjustmentStatus(403), false);
});

test("adjustment retry delay grows exponentially and stays bounded", () => {
  assert.equal(adjustmentRetryDelayMs(1, 0), 30_000);
  assert.equal(adjustmentRetryDelayMs(2, 0), 60_000);
  assert.equal(adjustmentRetryDelayMs(3, 0), 120_000);
  assert.ok(adjustmentRetryDelayMs(99, 1) <= 6 * 60 * 60 * 1000);
});

test("partialFailureError is failure even when the HTTP request itself succeeded", () => {
  assert.equal(hasGoogleAdsPartialFailure({ partialFailureError: { code: 3, message: "invalid" } }), true);
  assert.equal(hasGoogleAdsPartialFailure({ results: [] }), false);
  assert.equal(hasGoogleAdsPartialFailure(null), false);
});
