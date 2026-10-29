import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { normalizeWebsiteUpdate, websiteUpdateFingerprint, WebsiteUpdateError } from "./website-lead-updates";

const event = { submission_id: "quote-original", event_id: "11111111-1111-4111-8111-111111111111", revision: 1, occurred_at: "2026-10-29T12:00:00+00:00", contact: {}, follow_up: { kind: "callback_requested", message: "Call tomorrow" } };
test("callback-only updates accept empty contacts and normalize timezone/key order for replay", () => {
  const first = normalizeWebsiteUpdate(event);
  const second = normalizeWebsiteUpdate({ ...event, occurred_at: "2026-10-29T12:00:00Z", contact: {} });
  assert.equal(websiteUpdateFingerprint(first), websiteUpdateFingerprint(second));
  const a = normalizeWebsiteUpdate({ ...event, contact: { email: " CUSTOMER@EXAMPLE.COM ", name: " Customer " } });
  const b = normalizeWebsiteUpdate({ ...event, contact: { name: "Customer", email: "customer@example.com" } });
  assert.equal(websiteUpdateFingerprint(a), websiteUpdateFingerprint(b));
  assert.equal(a.contact.email, "customer@example.com");
  assert.equal(normalizeWebsiteUpdate({ ...event, contact: { name: "  Customer\n  Name  " } }).contact.name, "Customer Name");
});
test("rejects malformed, oversized, clearing and unsupported business/consent fields", () => {
  for (const input of [null, [], { ...event, revision: 0 }, { ...event, revision: 1.5 }, { ...event, revision: 2147483648 }, { ...event, event_id: "not-uuid" }, { ...event, occurred_at: "yesterday" }, { ...event, occurred_at: "2026-10-29T12:00:00" }, { ...event, contact: { email: "" } }, { ...event, contact: { phone: "<script>" } }, { ...event, contact: { name: "n".repeat(161) } }, { ...event, follow_up: { kind: "quote_updated", message: "m".repeat(16001) } }, { ...event, attribution: {} }, { ...event, notes: "replace human notes" }, { ...event, contact: { pipeline_status_code: "CLOSED_WON" } }]) {
    assert.throws(() => normalizeWebsiteUpdate(input), WebsiteUpdateError);
  }
});
test("history renders escaped for office roles after lead conversion and stays hidden for field roles", () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  const start = source.indexOf("function websiteLeadUpdatesHtml(");
  const body = source.slice(start, source.indexOf("\n}", start) + 2);
  for (const role of ["owner", "manager", "installer", "measurer"]) {
    const context: any = vm.createContext({ currentUser: () => ({ role }), canonicalLeads: [{ lead_id: "lead", pipeline_status: { status_code: "CONTACTED" }, website_updates: [{ revision: 2, occurred_at: "2026-10-29", message: "<img src=x onerror=alert(1)>" }] }], fmtDateTime: (v: string) => v, academyEsc: (v: unknown) => String(v).replace(/</g, "&lt;").replace(/>/g, "&gt;") });
    vm.runInContext(body, context);
    const rendered = context.websiteLeadUpdatesHtml("lead");
    if (["owner", "manager"].includes(role)) { assert.match(rendered, /data-website-updates/); assert.match(rendered, /&lt;img/); assert.doesNotMatch(rendered, /<img/); }
    else assert.equal(rendered, "");
  }
});

test("project polling refreshes only customer history without redrawing editable project fields", async () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  const start = source.indexOf("async function fetchCanonicalLeads(");
  const body = source.slice(start, source.indexOf("\n}", start) + 2);
  const host = { dataset: { projectWebsiteUpdates: "lead" }, innerHTML: "old history" };
  let renders = 0;
  const context: any = vm.createContext({
    canonicalLeads: [{ lead_id: "lead", website_updates: [] }],
    state: { view: "orderDetails", openOrderId: "project", modal: null },
    fetch: async () => ({ ok: true, json: async () => ({ data: { items: [{ lead_id: "lead", website_updates: [{ revision: 1 }] }] } }) }),
    document: { querySelector: () => host },
    getOrder: () => ({ canonicalLeadId: "lead" }),
    websiteLeadUpdatesHtml: () => "new history",
    render: () => { renders += 1; }, console,
  });
  vm.runInContext(body, context);
  await context.fetchCanonicalLeads({ renderIfVisible: true });
  assert.equal(host.innerHTML, "new history");
  assert.equal(renders, 0, "no full card redraw can replace a focused inline editor");
});
