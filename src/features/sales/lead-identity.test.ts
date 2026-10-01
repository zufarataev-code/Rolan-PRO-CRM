import assert from "node:assert/strict";
import test from "node:test";

import { normalizeLeadIdentity } from "./lead-identity";

test("a private lead keeps first and last name and builds the display name", () => {
  assert.deepEqual(normalizeLeadIdentity({ first_name: " Anna ", last_name: "Smith" }), {
    name: "Anna Smith",
    first_name: "Anna",
    last_name: "Smith",
    customer_type: "B2C",
    company_name: null,
    company_type: null,
    contact_title: null,
  });
});

test("a company lead shows the company and keeps its representative and title", () => {
  const lead = normalizeLeadIdentity({
    customer_type: "B2B",
    company_name: "Westlake Dental Group",
    company_type: "medical",
    first_name: "John",
    last_name: "Doe",
    contact_title: "Office manager",
  });
  assert.ok(!("error" in lead));
  assert.equal(lead.name, "Westlake Dental Group");
  assert.equal(lead.customer_type, "B2B");
  assert.equal(lead.company_type, "medical");
  assert.equal(lead.contact_title, "Office manager");
});

test("a company name alone makes the lead B2B; unknown company types become «other»", () => {
  const lead = normalizeLeadIdentity({ company_name: "Acme LLC", company_type: "Space agency" });
  assert.ok(!("error" in lead));
  assert.equal(lead.customer_type, "B2B");
  assert.equal(lead.company_type, "other");
});

test("an explicit name wins and the old single-name payload still works", () => {
  const lead = normalizeLeadIdentity({ name: "Maria" });
  assert.ok(!("error" in lead));
  assert.equal(lead.name, "Maria");
  assert.equal(lead.first_name, null);
});

test("a lead without any name is rejected", () => {
  assert.ok("error" in normalizeLeadIdentity({ last_name: "", company_name: " " }));
});

test("B2C leads never store company fields", () => {
  const lead = normalizeLeadIdentity({ first_name: "Ann", contact_title: "CEO", company_type: "office" });
  assert.ok(!("error" in lead));
  assert.equal(lead.contact_title, null);
  assert.equal(lead.company_type, null);
});

test("a B2B lead is shown by the company even when an old-style name is sent", () => {
  const lead = normalizeLeadIdentity({ name: "John Doe", company_name: "Acme LLC", first_name: "John" });
  assert.ok(!("error" in lead));
  assert.equal(lead.name, "Acme LLC");
});
