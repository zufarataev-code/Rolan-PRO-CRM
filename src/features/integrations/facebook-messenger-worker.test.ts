import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bookingPayload,
  buildBusinessWindows,
  crmLeadPayload,
  detectServiceType,
  leadReadyForBooking,
  normalizeLeadData,
  normalizeLanguage,
  parseBookingPayload,
  startsNewBooking,
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

test("Worker normalizes the legacy prompt fields before checking booking readiness", () => {
  const lead = normalizeLeadData({
    name: "Zafar",
    phone: "8183211212",
    goal: "Safety Film",
    objectType: "commercial",
    city: "Los Angeles",
  });
  assert.equal(lead.serviceType, "Safety Film");
  assert.equal(lead.propertyType, "commercial");
  assert.equal(leadReadyForBooking(lead), true);
});

test("Worker recognizes misspelled Russian Solar Film without confusing it with Safety Film", () => {
  assert.equal(detectServiceType("услга солнцезащитная пленка"), "Solar Film");
  assert.equal(detectServiceType("нужна солнцезащитная плёнка"), "Solar Film");
  assert.equal(detectServiceType("нужна защитная пленка на стекло"), "Safety Film");

  const lead = normalizeLeadData(
    {
      name: "Zafar",
      phone: "8183211212",
      serviceType: "Safety Film",
      propertyType: "commercial",
      city: "Los Angeles",
    },
    "услга солнцезащитная пленка",
  );
  assert.equal(lead.serviceType, "Solar Film");
  assert.equal(leadReadyForBooking(lead), true);
});

test("Worker recognizes the four supported service families from customer wording", () => {
  assert.equal(detectServiceType("smart film for a conference room"), "Smart Film");
  assert.equal(detectServiceType("защита от солнца и жары"), "Solar Film");
  assert.equal(detectServiceType("антиударная бронепленка"), "Safety Film");
  assert.equal(detectServiceType("матовая пленка для приватности"), "Decorative Film");
});

test("Worker preserves multilingual BCP-47 language tags for dates and operational replies", () => {
  assert.equal(normalizeLanguage("German"), "de");
  assert.equal(normalizeLanguage("fr-CA"), "fr-CA");
  assert.equal(normalizeLanguage("العربية"), "ar");
  assert.equal(normalizeLanguage("中文"), "zh");
  assert.equal(normalizeLanguage("not a language tag"), "en");
});

test("Worker recognizes a request to book another address", () => {
  assert.equal(startsNewBooking("и еще один адрес пожалуйста"), true);
  assert.equal(startsNewBooking("I need another location"), true);
  assert.equal(startsNewBooking("otra dirección"), true);
  assert.equal(startsNewBooking("да"), false);
});


test("Worker only promises SMS when CRM reports it", () => {
  const source = readFileSync("integrations/facebook-messenger-worker/src/index.ts", "utf8");
  assert.match(source, /smsStatus === "sent" \|\| smsStatus === "already_sent"/);
  assert.match(source, /Подтверждение отправлено SMS/);
  assert.match(source, /SMS сейчас не отправилось/);
  assert.match(source, /event: "crm_booking_confirmed"/);
  assert.match(source, /consultationId: booking\.consultation_id/);
  assert.match(source, /attemptedBookingClaim/);
  assert.match(source, /normalizeLeadData\(mergeLead\(state\.lead, output\.lead\), event\.text\)/);
  assert.match(source, /qualificationPrompt\(state\.lead, state\.lead\.language\)/);
  assert.match(source, /Это жилой дом или коммерческий объект/);
  assert.match(source, /BCP-47 language tag/);
  assert.match(source, /If the customer switches languages, switch with them/);
  assert.match(source, /localizeOperationalMessage/);
  assert.match(source, /target_language: languageTag/);
});
