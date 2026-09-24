import assert from "node:assert/strict";
import test from "node:test";

import { authorizeGoogleAdsSync } from "./sync-auth";

const secret = "a-secure-google-ads-sync-secret-123456";

test("Google Ads sync refuses a missing or short server secret", () => {
  assert.equal(authorizeGoogleAdsSync(`Bearer ${secret}`, undefined), "not_configured");
  assert.equal(authorizeGoogleAdsSync("Bearer short", "short"), "not_configured");
});
test("Google Ads sync accepts only the exact bearer secret", () => {
  assert.equal(authorizeGoogleAdsSync(`Bearer ${secret}`, secret), "authorized");
  assert.equal(authorizeGoogleAdsSync("Bearer wrong", secret), "unauthorized");
  assert.equal(authorizeGoogleAdsSync(null, secret), "unauthorized");
});
