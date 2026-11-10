import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMetaLead } from "./meta-lead-ads-core";
import { parseFacebookMessengerLeadPayload } from "./facebook-messenger-core";
import { createOrReuseFacebookMessengerLead } from "./facebook-messenger-db";
import { buildLeadWelcomeSms } from "../sales/lead-first-touch-core";
import { crmLeadPayload, leadReadyForCrm, leadReadyForBooking, parseLeadFormMessage } from "../../../integrations/facebook-messenger-worker/src/booking";

const notification = { lead_id: "901", page_id: "100", form_id: "200", ad_id: null };
const providerLead = {
  id: "901", form_id: "200", created_time: "2026-11-01T18:00:00Z",
  field_data: [
    { name: "phone_number", values: ["2025550123"] },
  ],
};

test("Meta phone-only intake accepts omitted, blank and unusable optional email", () => {
  for (const email of [undefined, "", "   ", "not-an-email"]) {
    const lead = normalizeMetaLead({ ...providerLead, field_data: [
      ...providerLead.field_data,
      ...(email === undefined ? [] : [{ name: "email", values: [email] }]),
    ] }, notification);
    assert.equal(lead.phone, "+12025550123");
    assert.equal(lead.email, null);
    assert.equal(lead.name, "+12025550123");
    assert.equal(lead.first_name, null);
    assert.equal(lead.last_name, null);
    assert.doesNotMatch(lead.notes, /service:|zip_code:/);
    assert.doesNotMatch(lead.notes, /not-an-email/);
  }
});

test("two-field Meta forms retain a supplied email without inventing a personal name", () => {
  const lead = normalizeMetaLead({ ...providerLead, field_data: [
    ...providerLead.field_data, { name: "email", values: ["CONTACT@example.test"] },
  ] }, notification);
  assert.equal(lead.email, "contact@example.test");
  assert.equal(lead.name, "+12025550123");
  const named = normalizeMetaLead({ ...providerLead, field_data: [
    ...providerLead.field_data, { name: "first_name", values: ["Offline"] }, { name: "last_name", values: ["Contact"] },
  ] }, notification);
  assert.equal(named.name, "Offline Contact");
  assert.throws(() => normalizeMetaLead({ ...providerLead, field_data: [] }, notification), /missing_contact/);
});

test("contact display labels receive a generic welcome greeting", () => {
  for (const name of ["+12025550123", "(202) 555-0123", "2025550123", "contact@example.test"]) {
    const sms = buildLeadWelcomeSms({ name, channel: "meta_lead_ads" });
    assert.match(sms, /^Hi there,/);
    assert.doesNotMatch(sms, /2025550123|contact@example/);
  }
});

test("Messenger can hand off a phone-only form without requiring name or service", () => {
  for (const suffix of ["", "\nEmail: contact@example.test"]) {
    const lead = parseLeadFormMessage(`Phone number: +12025550123${suffix}`);
    assert.equal(lead.phone, "+12025550123");
    assert.equal(lead.name, undefined);
    assert.equal(leadReadyForCrm(lead), true);
    assert.equal(leadReadyForBooking(lead), false);
    const payload = parseFacebookMessengerLeadPayload(crmLeadPayload(lead, "event", "contact", "page"));
    assert.equal(payload.name, "+12025550123");
    assert.equal(payload.email, suffix ? "contact@example.test" : undefined);
  }
  assert.deepEqual(parseLeadFormMessage("Phone number: invalid"), {});
  assert.equal(leadReadyForCrm({ name: "Only a name" }), false);
  assert.equal(leadReadyForBooking({ phone: "+12025550123", serviceType: "Solar Film", propertyType: "House", city: "LA" }), false);
});

test("Messenger reuses a phone-only Meta lead and enriches email without clearing it", async () => {
  const existing = {
    lead_id: "existing", phone: "(202) 555-0123", email: null as string | null,
    source: "meta_lead_ads", notes: "Original Meta attribution", assigned_manager_id: "manager",
  };
  let creates = 0;
  const tx = {
    lead: {
      findFirst: async () => null,
      findMany: async () => [existing],
      create: async () => { creates++; throw new Error("Duplicate lead must not be created"); },
      update: async ({ where, data }: any) => {
        assert.equal(where.lead_id, existing.lead_id);
        Object.assign(existing, data);
        return { lead_id: existing.lead_id, source: existing.source };
      },
    },
  };
  const user = { user_id: "manager", full_name: "Offline Manager", email: "manager@example.test", roles: ["MANAGER"] };
  for (const email of [undefined, "later@example.test", undefined]) {
    const payload = parseFacebookMessengerLeadPayload({
      external_event_id: "offline-message", external_contact_id: "offline-contact", page_id: "100",
      name: "Offline Contact", phone: "+12025550123", email,
    });
    const result = await createOrReuseFacebookMessengerLead(tx as any, payload, user, user);
    assert.equal(result.created, false);
    assert.equal(result.lead.lead_id, "existing");
  }
  assert.equal(creates, 0);
  assert.equal(existing.email, "later@example.test");
  assert.equal(existing.source, "meta_lead_ads");
  assert.match(existing.notes, /Original Meta attribution/);
});
