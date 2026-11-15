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


test("allows only the HMAC-protected operations agent endpoint through session middleware", () => {
  assert.equal(isPublicPath("/api/v1/agent"), true);
  assert.equal(isPublicPath("/api/v1/agent/status"), false);
  assert.equal(isPublicPath("/api/v1/agents"), false);
});

test("only the two Face ID sign-in routes are public; enrolling and managing keys is not", () => {
  assert.equal(isPublicPath("/api/v1/auth/passkey-login/options"), true);
  assert.equal(isPublicPath("/api/v1/auth/passkey-login/verify"), true);
  assert.equal(isPublicPath("/api/v1/auth/passkey-login"), false);
  assert.equal(isPublicPath("/api/v1/auth/passkey-login/verify/extra"), false);
  assert.equal(isPublicPath("/api/v1/auth/passkeys"), false);
  assert.equal(isPublicPath("/api/v1/auth/passkeys/register-options"), false);
  assert.equal(isPublicPath("/api/v1/auth/passkeys/register-verify"), false);
  assert.equal(isPublicPath("/api/v1/team/00000000-0000-0000-0000-000000000000/passkeys"), false);
});
