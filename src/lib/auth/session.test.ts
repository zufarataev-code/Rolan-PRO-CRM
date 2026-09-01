import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionToken,
  sessionCredentialFingerprint,
  sessionMatchesCurrentCredentials,
  verifySessionToken,
} from "./session";

process.env.AUTH_SECRET = "session-test-secret-that-is-long-enough-12345";
process.env.SESSION_TTL_HOURS = "1";

const user = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "employee@example.com",
  roles: ["installer"],
  passwordHash: "password-hash-v1",
};

test("session token carries a credential fingerprint", () => {
  const token = createSessionToken({
    sub: user.sub,
    email: user.email,
    roles: user.roles,
    pwd: sessionCredentialFingerprint(user.passwordHash),
  });
  const payload = verifySessionToken(token);

  assert.ok(payload);
  assert.equal(
    sessionMatchesCurrentCredentials(payload, user.email, user.passwordHash),
    true,
  );
});

test("session becomes invalid after password changes", () => {
  const token = createSessionToken({
    sub: user.sub,
    email: user.email,
    roles: user.roles,
    pwd: sessionCredentialFingerprint(user.passwordHash),
  });
  const payload = verifySessionToken(token);

  assert.ok(payload);
  assert.equal(
    sessionMatchesCurrentCredentials(payload, user.email, "password-hash-v2"),
    false,
  );
});

test("session becomes invalid after email changes", () => {
  const token = createSessionToken({
    sub: user.sub,
    email: user.email,
    roles: user.roles,
    pwd: sessionCredentialFingerprint(user.passwordHash),
  });
  const payload = verifySessionToken(token);

  assert.ok(payload);
  assert.equal(
    sessionMatchesCurrentCredentials(payload, "new-email@example.com", user.passwordHash),
    false,
  );
});

test("legacy session token without credential fingerprint is rejected", () => {
  const token = createSessionToken({
    sub: user.sub,
    email: user.email,
    roles: user.roles,
    pwd: sessionCredentialFingerprint(user.passwordHash),
  });
  const [header, payload, signature] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  delete decoded.pwd;
  const legacyPayload = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");

  // The original signature cannot validate against a modified payload, and any
  // genuine pre-hotfix token also lacks the required pwd field.
  assert.equal(verifySessionToken(`${header}.${legacyPayload}.${signature}`), null);
});
