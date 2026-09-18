import assert from "node:assert/strict";
import test from "node:test";

import {
  CustomerMatchValidationError,
  isAudienceConsentEligible,
  normalizeCustomerMatchDesiredState,
} from "./customer-match";

test("Customer Match ADD eligibility requires both explicit grants and audience eligibility", () => {
  assert.equal(
    isAudienceConsentEligible({
      ad_user_data: "GRANTED",
      ad_personalization: "GRANTED",
      audience_marketing_eligible: true,
    }),
    true,
  );

  assert.equal(
    isAudienceConsentEligible({
      ad_user_data: "UNKNOWN",
      ad_personalization: "GRANTED",
      audience_marketing_eligible: true,
    }),
    false,
  );
  assert.equal(
    isAudienceConsentEligible({
      ad_user_data: "GRANTED",
      ad_personalization: "DENIED",
      audience_marketing_eligible: true,
    }),
    false,
  );
  assert.equal(
    isAudienceConsentEligible({
      ad_user_data: "GRANTED",
      ad_personalization: "GRANTED",
      audience_marketing_eligible: false,
    }),
    false,
  );
  assert.equal(isAudienceConsentEligible(null), false);
});

test("desired state normalization only accepts ACTIVE or REMOVED", () => {
  assert.equal(normalizeCustomerMatchDesiredState(" active "), "ACTIVE");
  assert.equal(normalizeCustomerMatchDesiredState("removed"), "REMOVED");
  assert.throws(
    () => normalizeCustomerMatchDesiredState("UNKNOWN"),
    (error: unknown) => {
      assert.ok(error instanceof CustomerMatchValidationError);
      assert.equal(error.code, "invalid_desired_state");
      return true;
    },
  );
});
