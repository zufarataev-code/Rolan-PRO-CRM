import assert from "node:assert/strict";
import test from "node:test";

import { buildSiteLeadNotes, smsConsentDisclosure } from "./site-lead-notes";

test("records affirmative SMS consent with timestamp and disclosure", () => {
  const capturedAt = new Date("2026-08-09T12:30:00.000Z");
  const notes = buildSiteLeadNotes(
    {
      consentSource: "sms_consent_page",
      smsConsent: true,
      message: "Please schedule a consultation.",
    },
    capturedAt,
  );

  assert.match(notes, /Website service request with SMS opt-in/);
  assert.match(notes, /SMS consent: yes/);
  assert.match(notes, /SMS consent captured at: 2026-08-09T12:30:00.000Z/);
  assert.match(notes, new RegExp(smsConsentDisclosure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("accepts a service request without enrolling the customer in SMS", () => {
  const notes = buildSiteLeadNotes({
    consentSource: "sms_consent_page",
    smsConsent: false,
    message: "Please call me.",
  });

  assert.match(notes, /Website service request without SMS opt-in/);
  assert.match(notes, /SMS consent: no/);
  assert.doesNotMatch(notes, /SMS consent captured at:/);
  assert.doesNotMatch(notes, /SMS disclosure shown:/);
});
