import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHashedUserIdentifiers,
  normalizeEmail,
  normalizePhoneE164,
  sha256Hex,
} from "./normalization";

test("normalizes Gmail according to Google rules", () => {
  assert.equal(normalizeEmail(" John.Doe+Sales @ Gmail.com "), "johndoe@gmail.com");
  assert.equal(normalizeEmail("John.Doe+Sales@googlemail.com"), "johndoe@googlemail.com");
});

test("preserves dots and plus suffixes on non-Gmail domains", () => {
  assert.equal(normalizeEmail(" John.Doe+Sales@Example.com "), "john.doe+sales@example.com");
});

test("normalizes common US phone input to E.164", () => {
  assert.equal(normalizePhoneE164("(805) 555-1212"), "+18055551212");
  assert.equal(normalizePhoneE164("+44 20 7946 0958"), "+442079460958");
});

test("hashes each usable identifier exactly once", () => {
  const identifiers = buildHashedUserIdentifiers("Test.User@gmail.com", "805-555-1212");
  assert.deepEqual(identifiers, [
    { emailAddress: sha256Hex("testuser@gmail.com") },
    { phoneNumber: sha256Hex("+18055551212") },
  ]);
});

test("rejects unusable identifiers instead of double hashing them", () => {
  const digest = sha256Hex("already-hashed-source");
  assert.deepEqual(buildHashedUserIdentifiers(digest, digest), []);
});
