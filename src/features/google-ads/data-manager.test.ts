import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDataManagerEventsRequest,
  isRetryableDataManagerStatus,
  retryDelayMs,
  toGoogleConsentStatus,
} from "./data-manager";

test("maps CRM consent without upgrading unknown consent", () => {
  assert.equal(toGoogleConsentStatus("GRANTED"), "CONSENT_GRANTED");
  assert.equal(toGoogleConsentStatus("DENIED"), "CONSENT_DENIED");
  assert.equal(toGoogleConsentStatus("UNKNOWN"), "CONSENT_STATUS_UNSPECIFIED");
  assert.equal(toGoogleConsentStatus(undefined), "CONSENT_STATUS_UNSPECIFIED");
});

test("builds a validation-only Google Ads conversion request with stable identifiers", () => {
  const payload = buildDataManagerEventsRequest({
    operatingAccountId: "1234567890",
    loginAccountId: "9988776655",
    actionId: "1122334455",
    validateOnly: true,
    transactionId: "crm-deal-abc-sale",
    eventTimestamp: "2026-09-11T20:00:00.000Z",
    eventSource: "OTHER",
    conversionValue: 2500,
    currency: "usd",
    adIdentifiers: {
      gclid: "gclid-value",
      gbraid: null,
      wbraid: null,
      sessionAttributes: null,
    },
    userIdentifiers: [{ emailAddress: "abc123" }],
    consent: {
      adUserData: "CONSENT_GRANTED",
      adPersonalization: "CONSENT_GRANTED",
    },
  });

  assert.deepEqual(payload, {
    destinations: [
      {
        operatingAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" },
        loginAccount: { accountType: "GOOGLE_ADS", accountId: "9988776655" },
        productDestinationId: "1122334455",
      },
    ],
    encoding: "HEX",
    validateOnly: true,
    events: [
      {
        transactionId: "crm-deal-abc-sale",
        eventTimestamp: "2026-09-11T20:00:00.000Z",
        eventSource: "OTHER",
        adIdentifiers: { gclid: "gclid-value" },
        userData: { userIdentifiers: [{ emailAddress: "abc123" }] },
        consent: {
          adUserData: "CONSENT_GRANTED",
          adPersonalization: "CONSENT_GRANTED",
        },
        conversionValue: 2500,
        currency: "USD",
      },
    ],
  });
});

test("omits unavailable optional identifiers and falls back to OTHER event source", () => {
  const payload = buildDataManagerEventsRequest({
    operatingAccountId: "123",
    actionId: "456",
    validateOnly: true,
    transactionId: "crm-deal-x-sale",
    eventTimestamp: "2026-09-11T20:00:00.000Z",
    eventSource: "not-a-google-source",
    conversionValue: null,
    currency: null,
    adIdentifiers: { gclid: null, gbraid: "", wbraid: null, sessionAttributes: null },
    userIdentifiers: [],
    consent: null,
  });

  assert.deepEqual(payload, {
    destinations: [
      {
        operatingAccount: { accountType: "GOOGLE_ADS", accountId: "123" },
        productDestinationId: "456",
      },
    ],
    encoding: "HEX",
    validateOnly: true,
    events: [
      {
        transactionId: "crm-deal-x-sale",
        eventTimestamp: "2026-09-11T20:00:00.000Z",
        eventSource: "OTHER",
      },
    ],
  });
});

test("retries only temporary Data Manager HTTP failures", () => {
  assert.equal(isRetryableDataManagerStatus(408), true);
  assert.equal(isRetryableDataManagerStatus(429), true);
  assert.equal(isRetryableDataManagerStatus(500), true);
  assert.equal(isRetryableDataManagerStatus(503), true);
  assert.equal(isRetryableDataManagerStatus(400), false);
  assert.equal(isRetryableDataManagerStatus(401), false);
  assert.equal(isRetryableDataManagerStatus(403), false);
});

test("retry delay grows exponentially and remains bounded", () => {
  assert.equal(retryDelayMs(1, 0), 30_000);
  assert.equal(retryDelayMs(2, 0), 60_000);
  assert.equal(retryDelayMs(3, 0), 120_000);
  assert.ok(retryDelayMs(99, 1) <= 6 * 60 * 60 * 1000);
});
