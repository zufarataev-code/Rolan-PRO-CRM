import assert from "node:assert/strict";
import test from "node:test";

import {
  bookingPayload,
  buildBusinessWindows,
  crmLeadPayload,
  leadReadyForBooking,
  parseBookingPayload,
  zonedLocalToUtc,
} from "../../../integrations/facebook-messenger-worker/src/booking";
import { signCrmBody } from "../../../integrations/facebook-messenger-worker/src/crm";

test("Worker signs the exact timestamp and raw JSON body expected by CRM", async () => {
  const signature = await signCrmBody(
    '{"hello":"world"}',
    "1790160000",
    "01234567890123456789012345678901",
  );
  assert.equal(
    signature,
    "sha256=e9ad440cda47aeea97085ce59eab5aaa157e656a4a6e12a24ec6a100ba61e15b",
  );
});

test("Worker creates Los Angeles business windows and skips Sunday", () => {
  const windows = buildBusinessWindows(new Date("2026-09-26T23:30:00.000Z"), 2);
  assert.deepEqual(windows, [
    {
      start_at: "2026-09-28T15:00:00.000Z",
      end_at: "2026-09-29T00:00:00.000Z",
    },
    {
      start_at: "2026-09-29T15:00:00.000Z",
      end_at: "2026-09-30T00:00:00.000Z",
    },
  ]);
  assert.equal(zonedLocalToUtc(2026, 12, 1, 8).toISOString(), "2026-12-01T16:00:00.000Z");
});

test("Worker only accepts a quick reply that contains two valid CRM timestamps", () => {
  const slot = {
    start_at: "2026-09-24T16:00:00.000Z",
    end_at: "2026-09-24T17:00:00.000Z",
  };
  assert.deepEqual(parseBookingPayload(bookingPayload(slot)), slot);
  assert.equal(parseBookingPayload("ROLANPRO_BOOK|not-a-date|still-not-a-date"), null);
});

test("Worker maps the qualified conversation to the canonical CRM payload", () => {
  const lead = {
    name: "John Smith",
    phone: "(818) 555-1212",
    serviceType: "Smart Film",
    propertyType: "Commercial",
    city: "Westlake Village",
    goal: "Conference-room privacy",
    windows: "6",
  };
  assert.equal(leadReadyForBooking(lead), true);
  assert.deepEqual(crmLeadPayload(lead, "mid.1:lead", "psid-1", "page-1"), {
    external_event_id: "mid.1:lead",
    external_contact_id: "psid-1",
    page_id: "page-1",
    name: "John Smith",
    phone: "(818) 555-1212",
    email: undefined,
    service_type: "Smart Film",
    property_type: "Commercial",
    city: "Westlake Village",
    address: undefined,
    message: "Conference-room privacy\nApproximate windows: 6",
  });
});
