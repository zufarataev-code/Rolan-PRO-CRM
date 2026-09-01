import assert from "node:assert/strict";
import test from "node:test";

import {
  createPasswordResetToken,
  parsePasswordResetToken,
  passwordResetTokenMatchesUser,
} from "./password-recovery";

process.env.AUTH_SECRET = "password-recovery-test-secret-that-is-long-enough";

const now = 1_800_000_000_000;
const user = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "employee@example.com",
  passwordHash: "current-password-hash",
  isActive: true,
};

test("password reset token is signed and matches the current employee account", () => {
  const token = createPasswordResetToken({
    userId: user.userId,
    email: user.email,
    passwordHash: user.passwordHash,
    expiresAt: now + 30 * 60 * 1000,
  });
  const payload = parsePasswordResetToken(token);

  assert.ok(payload);
  assert.equal(passwordResetTokenMatchesUser(payload, user, now), true);
});

test("password reset token rejects signature tampering", () => {
  const token = createPasswordResetToken({
    userId: user.userId,
    email: user.email,
    passwordHash: user.passwordHash,
    expiresAt: now + 30 * 60 * 1000,
  });
  const [payload, signature] = token.split(".");
  const tamperedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;

  assert.equal(parsePasswordResetToken(`${payload}.${tamperedSignature}`), null);
});

test("password reset token expires after its TTL", () => {
  const token = createPasswordResetToken({
    userId: user.userId,
    email: user.email,
    passwordHash: user.passwordHash,
    expiresAt: now + 1_000,
  });
  const payload = parsePasswordResetToken(token);

  assert.ok(payload);
  assert.equal(passwordResetTokenMatchesUser(payload, user, now + 1_001), false);
});

test("password reset token becomes invalid after password is changed elsewhere", () => {
  const token = createPasswordResetToken({
    userId: user.userId,
    email: user.email,
    passwordHash: user.passwordHash,
    expiresAt: now + 30 * 60 * 1000,
  });
  const payload = parsePasswordResetToken(token);

  assert.ok(payload);
  assert.equal(passwordResetTokenMatchesUser(payload, { ...user, passwordHash: "new-password-hash" }, now), false);
});

test("password reset token becomes invalid after employee email changes", () => {
  const token = createPasswordResetToken({
    userId: user.userId,
    email: user.email,
    passwordHash: user.passwordHash,
    expiresAt: now + 30 * 60 * 1000,
  });
  const payload = parsePasswordResetToken(token);

  assert.ok(payload);
  assert.equal(passwordResetTokenMatchesUser(payload, { ...user, email: "new-email@example.com" }, now), false);
});
