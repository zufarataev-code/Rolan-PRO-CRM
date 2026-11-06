import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

test("active CRM inbox reads canonical Messenger leads without copying them into legacy storage", () => {
  assert.match(source, /let canonicalLeads = \[\]/);
  assert.match(source, /fetch\('\/api\/v1\/leads', \{ cache: 'no-store' \}\)/);
  // Messenger and website leads both live in PostgreSQL and are read, never copied.
  assert.match(source, /\['facebook_messenger', 'facebook_comment', 'website', 'callrail', 'meta_lead_ads'\]\.includes\(lead\?\.source\)/);
  assert.match(source, /CONSULTATION_SCHEDULED/);
  assert.match(source, /new Date\(right\.scheduled_start_at\).*new Date\(left\.scheduled_start_at\)/);
  assert.match(source, /!\['cancelled', 'canceled', 'deleted'\]\.includes\(item\?\.status\)/);
  assert.match(source, /startCanonicalLeadsPolling\(\)/);
  assert.doesNotMatch(source, /db\.canonicalLeads\s*=/);
});

test("booked Messenger leads open the canonical consultation instead of creating a duplicate project", () => {
  assert.match(source, /label: 'Messenger'/);
  // The id is JS-quoted and HTML-escaped: lead values come from public forms.
  assert.match(source, /openCanonicalConsultationCard\('\$\{academyEsc\(jsQuote\(l\.consultation\.consultation_id\)\)\}'\)/);
  assert.match(source, /function openCanonicalConsultationCard\(consultationId\)/);
  assert.match(source, /l\.canonical && l\.consultation/);
});

test("incoming Meta forms expose project and dismiss actions while Messenger keeps its consultation flow", () => {
  const start = source.indexOf("function renderLeadsView(");
  const render = source.slice(start, source.indexOf("\n}\n", start) + 2);
  function html(leadSource: string, consultation: object | null = null) {
    const context: any = vm.createContext({
      db: { settings: {} }, state: {}, canonicalLeadsRefreshedAt: Date.now(), facebookCommentsRefreshedAt: Date.now(),
      canonicalMessengerLeadRows: () => [{ id: "fixture", source: leadSource, canonical: true, name: "Test enquiry", phone: "+12025550123", consultation }],
      fetchCanonicalLeads: () => {}, fetchFacebookComments: () => {}, facebookCommentsInboxHtml: () => "", callrailRecentCallsHtml: () => "", LEAD_SOURCES: {},
      existingClientByContact: () => null, academyEsc: String, jsQuote: String, fmtDateTime: () => "fixture date",
    });
    vm.runInContext(render, context);
    return context.renderLeadsView() as string;
  }
  for (const source of ["meta_lead_ads", "facebook_comment", "website", "callrail"]) {
    assert.match(html(source), /convertLead\('fixture'\)/, source + " must be processable");
    assert.match(html(source), /dismissLead\('fixture'\)/, source + " must be dismissible");
  }
  assert.doesNotMatch(html("facebook_messenger"), /convertLead\(|dismissLead\(/);
  const booked = html("facebook_messenger", { consultation_id: "appointment" });
  assert.match(booked, /openCanonicalConsultationCard\('appointment'\)/);
  assert.doesNotMatch(booked, /convertLead\(/);
});
