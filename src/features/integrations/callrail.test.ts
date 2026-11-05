import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { CallrailError, normalizeCallrailCall, verifyCallrailSignature } from "./callrail-core";

const call = { id: 123, company_id: 456, direction: "inbound", start_time: "2026-11-01T10:00:00-08:00", duration: "63", answered: true, customer_phone_number: "(202) 555-0123", source_name: "Google Ads" };
test("CallRail verifies the exact raw body and rejects missing, malformed or altered signatures", () => {
  const raw = JSON.stringify(call), key = "offline-fixture-key";
  const signature = createHmac("sha1", key).update(raw).digest("base64");
  assert.equal(verifyCallrailSignature(raw, signature, key), true);
  for (const value of [null, "", "bad", signature.toLowerCase(), signature + "="]) assert.equal(verifyCallrailSignature(raw, value, key), false);
  assert.equal(verifyCallrailSignature(raw + " ", signature, key), false);
  assert.equal(verifyCallrailSignature(raw, signature, "other-key"), false);
});
test("only the configured company's inbound completed calls are enquiries", () => {
  assert.equal(normalizeCallrailCall({ ...call, direction: "outbound" }, "456"), null);
  assert.throws(() => normalizeCallrailCall(call, "other"), CallrailError);
  for (const change of [{ id: "" }, { duration: -1 }, { duration: null }, { duration: "" }, { answered: undefined }, { start_time: "tomorrow" }, { start_time: "2099-01-01T00:00:00Z" }]) {
    assert.throws(() => normalizeCallrailCall({ ...call, ...change }, "456"), CallrailError);
  }
  const result = normalizeCallrailCall({ ...call, lead_status: "good_lead", consent: "GRANTED" }, "456")!;
  assert.equal(result.phone, "+12025550123");
  assert.equal(result.attribution.consent?.adUserData, "UNKNOWN");
  assert.equal(normalizeCallrailCall({ ...call, customer_phone_number: "anonymous" }, "456")?.phone, null);
});
test("missed and provider-spam calls remain enquiries for manager review without granting consent", () => {
  for (const spam of [true, "true", false]) {
    const result = normalizeCallrailCall({ ...call, answered: false, duration: 0, spam }, "456")!;
    assert.ok(result);
    assert.equal(result.answered, false);
    assert.equal(result.duration, 0);
    assert.equal(result.spam, spam !== false);
    assert.equal(result.attribution.consent?.adUserData, "UNKNOWN");
  }
});
test("campaign attribution is joined to the actual click, never an unrelated first touch", () => {
  const first = { landing: "https://rolan-pro.com/?gclid=first&campaign_id=11&utm_source=google", event_date: "2026-10-20T10:00:00Z" };
  const last = { landing: "https://rolan-pro.com/?gclid=last&campaign_id=22&utm_source=google", event_date: "2026-10-30T10:00:00Z" };
  const result = normalizeCallrailCall({ ...call, gclid: "last", milestones: { first_touch: first, last_touch: last } }, "456")!;
  assert.equal(result.attribution.googleAdsCampaignId, "22");
  assert.equal(result.attribution.gclid, "last");
  assert.equal(result.attribution.capturedAt?.toISOString(), new Date(last.event_date).toISOString());
  const unmatched = normalizeCallrailCall({ ...call, gclid: "other", milestones: { first_touch: first } }, "456")!;
  assert.equal(unmatched.attribution.gclid, "other");
  assert.equal(unmatched.attribution.googleAdsCampaignId, undefined);
  assert.equal(unmatched.attribution.landingPage, undefined);
  const topLevel = normalizeCallrailCall({ ...call, gclid: "last", landing_page_url: last.landing }, "456")!;
  assert.equal(topLevel.attribution.googleAdsCampaignId, "22");
  assert.equal(topLevel.attribution.sessionAttributes?.source_channel, "PHONE");
});
test("call history remains visible and escaped on a handled project, only for office roles", () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  const start = source.indexOf("function websiteLeadUpdatesHtml(");
  const body = source.slice(start, source.indexOf("\n}", start) + 2);
  for (const role of ["owner", "manager", "installer"]) {
    const context: any = vm.createContext({ currentUser: () => ({ role }), canonicalLeads: [{ lead_id: "lead", callrail_calls: [{ message: "Google Ads <img onerror=x>" }] }], academyEsc: (v: string) => v.replace(/</g, "&lt;").replace(/>/g, "&gt;") });
    vm.runInContext(body, context);
    const html = context.websiteLeadUpdatesHtml("lead");
    if (role === "installer") assert.equal(html, "");
    else { assert.match(html, /data-callrail-calls/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/); }
  }
});

test("recent calls remain in the office inbox after an enquiry is handled or dismissed", () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  const start = source.indexOf("function callrailRecentCallsHtml(");
  const body = source.slice(start, source.indexOf("\n}", start) + 2);
  const context: any = vm.createContext({ currentUser: () => ({ role: "manager" }), canonicalLeads: [{ name: "Handled <caller>", phone: null, pipeline_status: { status_code: "CONTACTED" }, callrail_calls: [{ occurred_at: "2026-11-01", message: "missed · Google Ads" }] }], academyEsc: (v: string) => v.replace(/</g, "&lt;").replace(/>/g, "&gt;") });
  vm.runInContext(body, context);
  assert.match(context.callrailRecentCallsHtml(), /data-callrail-recent/);
  assert.match(context.callrailRecentCallsHtml(), /missed · Google Ads/);
  assert.match(context.callrailRecentCallsHtml(), /&lt;caller&gt;/);
});
