import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAvailableSlots,
  createFacebookMessengerSignature,
  facebookMessengerContactLockKeys,
  facebookMessengerPayloadHash,
  formatFacebookMessengerBookingSms,
  normalizeContactPhone,
  parseFacebookMessengerBookingPayload,
  parseFacebookMessengerLeadPayload,
  verifyFacebookMessengerSignature,
} from "./facebook-messenger-core";
import { acquireFacebookMessengerLock } from "./facebook-messenger-db";

test("Facebook Messenger advisory locks execute without deserializing PostgreSQL void", async () => {
  let executed = false;
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      executed = true;
      assert.deepEqual(Array.from(strings), [
        "SELECT pg_advisory_xact_lock(hashtext(",
        "), hashtext(",
        "))",
      ]);
      assert.deepEqual(values, ["facebook-messenger-lead", "page:contact"]);
      return 1;
    },
  };

  await acquireFacebookMessengerLock(
    tx as Parameters<typeof acquireFacebookMessengerLock>[0],
    "facebook-messenger-lead",
    "page:contact",
  );

  assert.equal(executed, true);
});

test("Facebook Messenger HMAC accepts a current authentic request", () => {
  const secret = "a-very-long-test-secret-that-is-over-32-characters";
  const timestamp = "1789963200";
  const rawBody = JSON.stringify({ external_event_id: "mid.1" });
  const signature = createFacebookMessengerSignature(rawBody, timestamp, secret);

  assert.equal(
    verifyFacebookMessengerSignature({
      rawBody,
      timestamp,
      signature,
      secret,
      nowMs: Number(timestamp) * 1000,
    }),
    true,
  );
});

test("Facebook Messenger HMAC rejects tampering, stale requests, and a missing prefix", () => {
  const secret = "a-very-long-test-secret-that-is-over-32-characters";
  const timestamp = "1789963200";
  const rawBody = JSON.stringify({ external_event_id: "mid.1" });
  const signature = createFacebookMessengerSignature(rawBody, timestamp, secret);

  assert.equal(
    verifyFacebookMessengerSignature({
      rawBody: `${rawBody} `,
      timestamp,
      signature,
      secret,
      nowMs: Number(timestamp) * 1000,
    }),
    false,
  );
  assert.equal(
    verifyFacebookMessengerSignature({
      rawBody,
      timestamp,
      signature,
      secret,
      nowMs: Number(timestamp) * 1000 + 6 * 60 * 1000,
    }),
    false,
  );
  assert.equal(
    verifyFacebookMessengerSignature({
      rawBody,
      timestamp,
      signature: signature.slice("sha256=".length),
      secret,
      nowMs: Number(timestamp) * 1000,
    }),
    false,
  );
});

test("contact phones normalize to a stable US E.164 key", () => {
  assert.equal(normalizeContactPhone("(818) 555-1212"), "+18185551212");
  assert.equal(normalizeContactPhone("1-818-555-1212"), "+18185551212");
  assert.throws(
    () =>
      parseFacebookMessengerLeadPayload({
        external_event_id: "mid.bad-phone",
        external_contact_id: "psid",
        page_id: "page",
        name: "John",
        phone: "not-a-phone",
      }),
    /phone is invalid/,
  );
});

test("contact advisory keys are stable across formatted phone numbers", () => {
  const first = parseFacebookMessengerLeadPayload({
    external_event_id: "mid.1",
    external_contact_id: "psid",
    page_id: "page",
    name: "John",
    phone: "(818) 555-1212",
    email: "John@Example.com",
  });
  const second = parseFacebookMessengerLeadPayload({
    external_event_id: "mid.2",
    external_contact_id: "psid",
    page_id: "page",
    name: "John",
    phone: "+18185551212",
    email: "john@example.com",
  });

  assert.deepEqual(facebookMessengerContactLockKeys(first), facebookMessengerContactLockKeys(second));
});

test("booking payload hash changes when a material booking field changes", () => {
  const first = parseFacebookMessengerBookingPayload({
    external_event_id: "mid.booking",
    external_contact_id: "psid",
    page_id: "page",
    name: "John",
    phone: "+18185551212",
    title: "Consultation A",
    scheduled_start_at: "2026-09-24T12:00:00-07:00",
    scheduled_end_at: "2026-09-24T13:00:00-07:00",
  });
  const second = { ...first, title: "Consultation B" };

  assert.notEqual(facebookMessengerPayloadHash(first), facebookMessengerPayloadHash(second));
});

test("available slot builder excludes overlaps but allows touching boundaries", () => {
  const slots = buildAvailableSlots({
    windows: [
      {
        startAt: new Date("2026-09-24T16:00:00.000Z"),
        endAt: new Date("2026-09-24T20:00:00.000Z"),
      },
    ],
    busyRanges: [
      {
        startAt: new Date("2026-09-24T17:00:00.000Z"),
        endAt: new Date("2026-09-24T18:00:00.000Z"),
      },
    ],
    durationMinutes: 60,
    stepMinutes: 30,
    limit: 20,
  });

  assert.deepEqual(
    slots.map((slot) => slot.start_at),
    [
      "2026-09-24T16:00:00.000Z",
      "2026-09-24T18:00:00.000Z",
      "2026-09-24T18:30:00.000Z",
      "2026-09-24T19:00:00.000Z",
    ],
  );
});


test("booking SMS uses Los Angeles time and clear confirmation copy", () => {
  const text = formatFacebookMessengerBookingSms("2026-09-24T19:00:00.000Z");
  assert.match(text, /ROLANPRO:/);
  assert.match(text, /Sep 24/);
  assert.match(text, /12:00 PM/);
  assert.match(text, /confirmed/i);
});
