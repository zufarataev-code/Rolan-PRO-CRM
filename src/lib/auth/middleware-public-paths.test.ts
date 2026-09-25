import assert from "node:assert/strict";
import test from "node:test";

import { isPublicPath } from "../../../middleware";

test("allows the HMAC-protected website lead endpoint through session middleware", () => {
  assert.equal(isPublicPath("/api/v1/integrations/website/leads"), true);
});

test("does not make neighboring integration routes public", () => {
  assert.equal(isPublicPath("/api/v1/integrations/website/leads/status"), false);
  assert.equal(isPublicPath("/api/v1/integrations/google-ads/settings"), false);
});
