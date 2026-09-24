import assert from "node:assert/strict";
import test from "node:test";

import {
  hasAttributionData,
  normalizeAttributionCapture,
  normalizeConsentState,
} from "./attribution";

test("empty click identifiers do not become an attribution touchpoint", () => {
  const capture = normalizeAttributionCapture({
    gclid: "   ",
    gbraid: "",
    wbraid: null,
  });

  assert.ok(capture);
  assert.equal(capture.gclid, null);
  assert.equal(capture.gbraid, null);
  assert.equal(capture.wbraid, null);
  assert.equal(hasAttributionData(capture), false);
});

test("preserves real Google and UTM attribution values", () => {
  const capture = normalizeAttributionCapture({
    gclid: "  google-click-id  ",
    landingPage: " https://rolan-pro.com/smart-film?utm_source=google ",
    utmSource: " google ",
    utmCampaign: " smart-film-la ",
    sessionAttributes: { session_id: "abc" },
  });

  assert.ok(capture);
  assert.equal(capture.gclid, "google-click-id");
  assert.equal(capture.utmSource, "google");
  assert.equal(capture.utmCampaign, "smart-film-la");
  assert.equal(hasAttributionData(capture), true);
});

test("unknown and invalid consent never become granted", () => {
  assert.equal(normalizeConsentState(undefined), "UNKNOWN");
  assert.equal(normalizeConsentState("unknown"), "UNKNOWN");
  assert.equal(normalizeConsentState("yes"), "UNKNOWN");
  assert.equal(normalizeConsentState("denied"), "DENIED");
});

test("audience eligibility cannot override denied consent", () => {
  const capture = normalizeAttributionCapture({
    consent: {
      adUserData: "DENIED",
      adPersonalization: "GRANTED",
      audienceMarketingEligible: true,
      source: "website-form",
    },
  });

  assert.ok(capture?.consent);
  assert.equal(capture.consent.adUserData, "DENIED");
  assert.equal(capture.consent.audienceMarketingEligible, false);
});

test("audience eligibility requires explicit granted consent", () => {
  const capture = normalizeAttributionCapture({
    consent: {
      adUserData: "GRANTED",
      adPersonalization: "GRANTED",
      audienceMarketingEligible: true,
      source: "website-form",
      policyVersion: "2026-09",
    },
  });

  assert.ok(capture?.consent);
  assert.equal(capture.consent.audienceMarketingEligible, true);
  assert.equal(capture.consent.policyVersion, "2026-09");
});
