import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSKEY_CHALLENGE_TTL_SECONDS,
  allowedPasskeyOrigins,
  challengeUseKey,
  cleanPasskeyDeviceName,
  createChallengeToken,
  describePasskeyDevice,
  readChallengeToken,
  resolveRelyingParty,
} from "./passkey-core";

const SECRET = "test-secret-test-secret-test-secret-1234";
const NOW = 1_800_000_000;

test("allows APP_URL and extra origins; plain http only for the machine itself", () => {
  assert.deepEqual(
    allowedPasskeyOrigins({
      appUrl: "https://crm.example.com/some/path",
      extraOrigins: " https://old.example.com , http://evil.example.com, not-a-url, ftp://crm.example.com, ",
    }),
    ["https://crm.example.com", "https://old.example.com"],
  );
  assert.deepEqual(allowedPasskeyOrigins({ appUrl: "http://localhost:3000" }), ["http://localhost:3000"]);
  assert.deepEqual(allowedPasskeyOrigins({ appUrl: "http://127.0.0.1:3000" }), ["http://127.0.0.1:3000"]);
  assert.deepEqual(allowedPasskeyOrigins({ appUrl: "http://localhost.evil.example.com" }), []);
  assert.deepEqual(allowedPasskeyOrigins({ appUrl: "" }), []);
});

test("relying party comes only from an allow-listed Origin header", () => {
  const allowed = ["https://crm.example.com"];
  assert.deepEqual(resolveRelyingParty("https://crm.example.com", allowed), {
    origin: "https://crm.example.com",
    rpId: "crm.example.com",
  });
  assert.equal(resolveRelyingParty("https://evil.example.com", allowed), null);
  assert.equal(resolveRelyingParty("https://crm.example.com.evil.io", allowed), null);
  assert.equal(resolveRelyingParty(null, allowed), null);
  assert.equal(resolveRelyingParty("null", allowed), null);
});

test("challenge token round-trips only for the same purpose, relying party and user", () => {
  const token = createChallengeToken(
    SECRET,
    { purpose: "register", challenge: "abc123", rpId: "crm.example.com", userId: "user-1" },
    NOW,
  );
  const expected = { purpose: "register" as const, rpId: "crm.example.com", userId: "user-1" };

  assert.equal(readChallengeToken(SECRET, token, expected, NOW + 10), "abc123");
  assert.equal(readChallengeToken(SECRET, token, { ...expected, purpose: "login" }, NOW + 10), null);
  assert.equal(readChallengeToken(SECRET, token, { ...expected, rpId: "other.example.com" }, NOW + 10), null);
  assert.equal(readChallengeToken(SECRET, token, { ...expected, userId: "user-2" }, NOW + 10), null);
  assert.equal(readChallengeToken(SECRET, token, { purpose: "register", rpId: "crm.example.com" }, NOW + 10), null);
});

test("challenge token expires and rejects tampering or another secret", () => {
  const token = createChallengeToken(SECRET, { purpose: "login", challenge: "xyz", rpId: "crm.example.com" }, NOW);
  const expected = { purpose: "login" as const, rpId: "crm.example.com" };

  assert.equal(readChallengeToken(SECRET, token, expected, NOW + PASSKEY_CHALLENGE_TTL_SECONDS - 1), "xyz");
  assert.equal(readChallengeToken(SECRET, token, expected, NOW + PASSKEY_CHALLENGE_TTL_SECONDS), null);
  assert.equal(readChallengeToken("another-secret-another-secret-another-1", token, expected, NOW + 1), null);

  const [body, signature] = token.split(".");
  const forgedBody = Buffer.from(
    JSON.stringify({ p: "login", c: "attacker", r: "crm.example.com", u: "", e: NOW + 100 }),
  ).toString("base64url");
  assert.equal(readChallengeToken(SECRET, `${forgedBody}.${signature}`, expected, NOW + 1), null);
  assert.equal(readChallengeToken(SECRET, `${body}.${signature}.extra`, expected, NOW + 1), null);
  assert.equal(readChallengeToken(SECRET, "", expected, NOW + 1), null);
  assert.equal(readChallengeToken(SECRET, undefined, expected, NOW + 1), null);
});

test("a used challenge is recorded under a stable, fixed-length key", () => {
  assert.equal(challengeUseKey("abc"), challengeUseKey("abc"));
  assert.notEqual(challengeUseKey("abc"), challengeUseKey("abd"));
  assert.match(challengeUseKey("abc"), /^[0-9a-f]{64}$/);
});

test("device label is readable and bounded", () => {
  assert.equal(
    describePasskeyDevice("Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1"),
    "iPad · Safari",
  );
  assert.equal(
    describePasskeyDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36"),
    "Mac · Chrome",
  );
  assert.equal(describePasskeyDevice(null), "Устройство");
  assert.equal(cleanPasskeyDeviceName("  Мой\u0000 iPad  ", "x"), "Мой iPad");
  assert.equal(cleanPasskeyDeviceName("   ", "iPad · Safari"), "iPad · Safari");
  assert.equal(cleanPasskeyDeviceName(42, "iPad"), "iPad");
  assert.equal(cleanPasskeyDeviceName("a".repeat(500), "x").length, 120);
});
