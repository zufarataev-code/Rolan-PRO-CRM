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
  shouldRestartBookedConversation,
  shouldUseQualificationPrompt,
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
  assert.equal(startsNewBooking("запиши меня на замер"), true);
  assert.equal(startsNewBooking("хочу записаться"), true);
  assert.equal(startsNewBooking("I need another location"), true);
  assert.equal(startsNewBooking("book me for a consultation"), true);
  assert.equal(startsNewBooking("otra dirección"), true);
  assert.equal(startsNewBooking("quiero agendar una cita"), true);
  assert.equal(startsNewBooking("да"), false);
  assert.equal(startsNewBooking("запись не появилась в CRM"), false);
});

test("Worker never sends a qualification dead end for a customer who is already booked", () => {
  assert.equal(shouldUseQualificationPrompt(true, false), true);
  assert.equal(shouldUseQualificationPrompt(true, true), false);
  assert.equal(shouldUseQualificationPrompt(false, true), false);
});

test("Worker restarts a booked conversation when AI tries to create another booking", () => {
  assert.equal(shouldRestartBookedConversation(true, true), true);
  assert.equal(shouldRestartBookedConversation(true, false), false);
  assert.equal(shouldRestartBookedConversation(false, true), false);
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
  assert.match(source, /claude-haiku-4-5-20251001/);
  assert.match(source, /Application state: this customer already has a confirmed booking/);
  assert.match(source, /MAGNITRONIC PRIME is Rolan PRO's own premium solar-control film series/);
  assert.match(source, /our Rolan PRO MAGNITRONIC PRIME film/);
  assert.match(source, /SP-05 VLT 5\.7%, IRR 95\.6%, UVR 100%, TSER 93\.3%/);
  assert.match(source, /SP-20 VLT 23\.5%, IRR 96\.2%, UVR 99\.9%, TSER 83\.2%/);
  assert.match(source, /SP-70 VLT 68\.0%, IRR 99\.1%, UVR 99\.2%, TSER 63\.6%/);
  assert.match(source, /IGU\/double-pane, Low-E, tinted glass, and skylights require technical review/);
  assert.match(source, /summary of Rolan PRO's written Limited Warranty/);
  assert.match(source, /Residential Limited Lifetime warranty while the original retail purchaser continuously owns that residence/);
  assert.match(source, /Commercial, rental, common-area, hospitality, institutional, leased/);
  assert.match(source, /first 5 years generally include standard replacement material and standard installation labor/);
  assert.match(source, /reported within 30 days after discovery/);
  assert.match(source, /Years 1-5 use the applicable manufacturer warranty; years 6-12 are Rolan PRO's own Extended Limited Warranty/);
  assert.match(source, /power supply, transformer, controller, or related control device is covered for 5 years/);
  assert.match(source, /may transfer once to a subsequent owner of the same property/);
  assert.match(source, /is not a guarantee against break-in, injury, glass breakage, penetration, or loss/);
  assert.match(source, /Rolan PRO's own clear SAF protective-film range/);
  assert.match(source, /SAF 50 - 2 mil, 1 ply, tensile strength 19,000 psi/);
  assert.match(source, /SAF 200 - 8 mil, 2 ply, 19,250 psi/);
  assert.match(source, /SAF 400 - 16 mil, 4 ply, 24,800 psi/);
  assert.match(source, /All six cards state VLT 98%, UV rejection 98%, and IR rejection 18%/);
  assert.match(source, /Never call the glass unbreakable, shatterproof, burglar-proof, bulletproof, blast-proof/);
  assert.match(source, /complete system: film, glass, frame, edge attachment or anchoring/);
  assert.match(source, /static-cling privacy patterns AT-001 through AT-028/);
  assert.match(source, /3D laser-rainbow static patterns are AT-029 through AT-035 and AT-044 through AT-048/);
  assert.match(source, /AT-C002 clear, grey, tea, or black 5 mm/);
  assert.match(source, /AT-C004 clear, tea, or grey 15 mm/);
  assert.match(source, /textured AT-S50 and prismatic AT-055B/);
  assert.match(source, /not verified performance ratings or confirmation of current stock/);
  assert.match(source, /do not promise complete privacy in every lighting condition/);
  assert.doesNotMatch(source, /Проверяю свободное время в CRM/);
  assert.match(source, /shouldUseQualificationPrompt\(attemptedBookingClaim, alreadyBooked\)/);
  assert.match(source, /shouldRestartBookedConversation\(attemptedBookingClaim, alreadyBooked\)/);
  assert.match(source, /state\.leadCapturedEventId = undefined/);
  assert.match(source, /event: "repeat_booking_started"/);
});
