import assert from "node:assert/strict";
import test from "node:test";

import {
  ExternalApiError,
  parseExternalLeadPayload,
  verifyExternalApiBearerToken,
} from "./external-api-core";

test("external API bearer authentication accepts only the configured secret", () => {
  const key = "k".repeat(32);

  assert.equal(verifyExternalApiBearerToken(`Bearer ${key}`, key), true);
  assert.equal(verifyExternalApiBearerToken(`bearer ${key}`, key), true);
  assert.equal(verifyExternalApiBearerToken("Bearer wrong", key), false);
  assert.equal(verifyExternalApiBearerToken(null, key), false);
  assert.equal(verifyExternalApiBearerToken(`Bearer ${key}`, null), false);
});

test("external lead payload normalizes source and email", () => {
  const payload = parseExternalLeadPayload({
    source: "Facebook_Worker",
    external_id: "evt-123",
    external_contact_id: "contact-7",
    name: " Jane Doe ",
    phone: " (805) 555-1212 ",
    email: "JANE@EXAMPLE.COM",
  });

  assert.equal(payload.source, "facebook_worker");
  assert.equal(payload.name, "Jane Doe");
  assert.equal(payload.email, "jane@example.com");
});

test("external lead payload rejects invalid source", () => {
  assert.throws(
    () =>
      parseExternalLeadPayload({
        source: "facebook worker",
        external_id: "evt-123",
        name: "Jane Doe",
        phone: "8055551212",
      }),
    (error) =>
      error instanceof ExternalApiError &&
      error.status === 400 &&
      error.code === "invalid_payload",
  );
});
