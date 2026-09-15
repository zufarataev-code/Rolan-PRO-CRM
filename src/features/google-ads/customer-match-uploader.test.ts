import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCustomerMatchAudienceRequest,
  customerMatchRetryDelayMs,
  isRetryableCustomerMatchStatus,
  readCustomerMatchIdentifierSnapshot,
} from "./customer-match-uploader";

test("builds Customer Match ADD request with composite data, granted consent and accepted terms", () => {
  const payload = buildCustomerMatchAudienceRequest({
    operatingAccountId: "1234567890",
    loginAccountId: "9876543210",
    userListId: "11223344",
    operation: "ADD",
    identifiers: [
      { emailAddress: "a".repeat(64) },
      { phoneNumber: "b".repeat(64) },
    ],
    validateOnly: true,
  });

  assert.deepEqual(payload, {
    destinations: [
      {
        operatingAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" },
        productDestinationId: "11223344",
        loginAccount: { accountType: "GOOGLE_ADS", accountId: "9876543210" },
      },
    ],
    audienceMembers: [
      {
        compositeData: {
          userData: {
            userIdentifiers: [
              { emailAddress: "a".repeat(64) },
              { phoneNumber: "b".repeat(64) },
            ],
          },
        },
      },
    ],
    encoding: "HEX",
    validateOnly: true,
    consent: {
      adUserData: "CONSENT_GRANTED",
      adPersonalization: "CONSENT_GRANTED",
    },
    termsOfService: {
      customerMatchTermsOfServiceStatus: "ACCEPTED",
    },
  });
});

test("builds Customer Match REMOVE without consent or Terms of Service gates", () => {
  const payload = buildCustomerMatchAudienceRequest({
    operatingAccountId: "1234567890",
    userListId: "11223344",
    operation: "REMOVE",
    identifiers: [{ emailAddress: "c".repeat(64) }],
    validateOnly: false,
  });

  assert.deepEqual(payload, {
    destinations: [
      {
        operatingAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" },
        productDestinationId: "11223344",
      },
    ],
    audienceMembers: [
      {
        compositeData: {
          userData: {
            userIdentifiers: [{ emailAddress: "c".repeat(64) }],
          },
        },
      },
    ],
    encoding: "HEX",
    validateOnly: false,
  });
});

test("identifier snapshot parser keeps only hashed email/phone identifier shapes", () => {
  assert.deepEqual(
    readCustomerMatchIdentifierSnapshot([
      { emailAddress: "a".repeat(64) },
      { phoneNumber: "b".repeat(64) },
      { unknown: "value" },
      null,
    ]),
    [
      { emailAddress: "a".repeat(64) },
      { phoneNumber: "b".repeat(64) },
    ],
  );
});

test("Customer Match retry classification matches Data Manager retry policy", () => {
  assert.equal(isRetryableCustomerMatchStatus(408), true);
  assert.equal(isRetryableCustomerMatchStatus(429), true);
  assert.equal(isRetryableCustomerMatchStatus(500), true);
  assert.equal(isRetryableCustomerMatchStatus(503), true);
  assert.equal(isRetryableCustomerMatchStatus(400), false);
  assert.equal(isRetryableCustomerMatchStatus(403), false);
});

test("Customer Match retry delay grows and remains capped", () => {
  assert.equal(customerMatchRetryDelayMs(1, 0), 30_000);
  assert.equal(customerMatchRetryDelayMs(2, 0), 60_000);
  assert.equal(customerMatchRetryDelayMs(3, 0), 120_000);
  assert.ok(customerMatchRetryDelayMs(99, 1) <= 6 * 60 * 60 * 1000);
});
