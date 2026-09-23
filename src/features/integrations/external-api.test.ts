import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAvailableSlots,
  ExternalApiError,
  parseExternalBookingPayload,
  parseExternalLeadPayload,
  parseExternalSlotPayload,
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

test("external booking payload requires an increasing time range", () => {
  assert.throws(
    () =>
      parseExternalBookingPayload({
        source: "facebook_worker",
        external_id: "booking-1",
        name: "Jane Doe",
        phone: "8055551212",
        scheduled_start_at: "2026-10-01T18:00:00.000Z",
        scheduled_end_at: "2026-10-01T17:00:00.000Z",
      }),
    (error) =>
      error instanceof ExternalApiError &&
      error.status === 400 &&
      error.code === "invalid_payload",
  );
});

test("external slot parser and availability remove busy ranges", () => {
  const input = parseExternalSlotPayload({
    windows: [
      {
        start_at: "2026-10-01T16:00:00.000Z",
        end_at: "2026-10-01T19:00:00.000Z",
      },
    ],
    duration_minutes: 60,
    step_minutes: 60,
    limit: 10,
  });

  const slots = buildAvailableSlots({
    ...input,
    busyRanges: [
      {
        startAt: new Date("2026-10-01T17:00:00.000Z"),
        endAt: new Date("2026-10-01T18:00:00.000Z"),
      },
    ],
  });

  assert.deepEqual(slots, [
    {
      start_at: "2026-10-01T16:00:00.000Z",
      end_at: "2026-10-01T17:00:00.000Z",
    },
    {
      start_at: "2026-10-01T18:00:00.000Z",
      end_at: "2026-10-01T19:00:00.000Z",
    },
  ]);
});
