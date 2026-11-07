import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { MetaLeadError, metaId, metaLeadNotifications, normalizeMetaLead, verifyMetaSignature } from "./meta-lead-ads-core";
import { GET, POST } from "../../../app/api/webhooks/meta-lead-ads/route";

const notification = { lead_id: "90000000000000001", page_id: "100", form_id: "200", ad_id: "300" };
const payload = { object: "page", entry: [{ id: "100", changes: [{ field: "leadgen", value: { page_id: "100", form_id: "200", leadgen_id: notification.lead_id, ad_id: "300" } }] }] };
const lead = { id: notification.lead_id, form_id: "200", ad_id: "300", campaign_id: "400", adset_id: "500", campaign_name: "County · Income", adset_name: "Solar", ad_name: "Quote", platform: "fb", created_time: new Date().toISOString(), field_data: [
  { name: "full_name", values: ["Offline Fixture"] }, { name: "email", values: ["fixture@example.test"] },
  { name: "phone_number", values: ["2025550123"] }, { name: "zip_code", values: ["90210"] },
  { name: "which_service", values: ["Solar & Heat Control"] },
] };
test("Meta signs exact bytes; missing, malformed, forged and altered signatures fail", () => {
  const raw = Buffer.from(JSON.stringify(payload)), secret = "offline-only-secret";
  const signature = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyMetaSignature(raw, signature, secret), true);
  for (const value of [null, "", "sha1=abc", "sha256=abc", signature + "x"]) assert.equal(verifyMetaSignature(raw, value, secret), false);
  assert.equal(verifyMetaSignature(Buffer.concat([raw, Buffer.from(" ")]), signature, secret), false);
  assert.equal(verifyMetaSignature(raw, signature, "other"), false);
  assert.throws(() => metaId(90000000000000001), MetaLeadError, "unsafe JSON numbers cannot silently round provider IDs");
});
test("only leadgen events for the configured Page and forms are accepted", () => {
  assert.deepEqual(metaLeadNotifications(payload, "100", ["200"]), [notification]);
  assert.deepEqual(metaLeadNotifications(payload, "101", ["200"]), []);
  assert.deepEqual(metaLeadNotifications(payload, "100", ["201"]), []);
  const mixed = structuredClone(payload);
  mixed.entry[0].changes.push({ field: "feed", value: {} as any });
  assert.deepEqual(metaLeadNotifications(mixed, "100", ["200"]), [notification]);
  for (const invalid of [null, [], {}, { object: "page", entry: [null] }]) assert.throws(() => metaLeadNotifications(invalid, "100", ["200"]), MetaLeadError);
});
test("provider data preserves service, ZIP and attribution without trusting webhook contact fields", () => {
  const result = normalizeMetaLead(lead, notification);
  assert.equal(result.phone, "+12025550123");
  assert.equal(result.metadata.campaign_id, "400");
  assert.match(result.notes, /which_service: Solar & Heat Control/);
  assert.match(result.notes, /zip_code: 90210/);
  assert.doesNotMatch(result.notes, /fixture@example/);
  for (const changes of [{ id: "999" }, { form_id: "999" }, { ad_id: "999" }, { created_time: "invalid" }, { field_data: [] }, { field_data: [...lead.field_data, lead.field_data[0]] }]) assert.throws(() => normalizeMetaLead({ ...lead, ...changes }, notification), MetaLeadError);
  const invalidContacts = { ...lead, field_data: lead.field_data.map(field => ["email", "phone_number"].includes(field.name) ? { ...field, values: ["<img onerror=x>"] } : field) };
  assert.throws(() => normalizeMetaLead(invalidContacts, notification), MetaLeadError);
});
test("webhook verification, disabled configuration, raw signatures and streamed size limits fail closed", async () => {
  const keys = ["APP_SECRET", "VERIFY_TOKEN", "PAGE_ACCESS_TOKEN", "PAGE_ID", "FORM_IDS"].map(key => "META_LEAD_ADS_" + key);
  const commentKeys = ["APP_SECRET", "VERIFY_TOKEN", "PAGE_ACCESS_TOKEN", "PAGE_ID"].map(key => "META_COMMENTS_" + key);
  const allKeys = [...keys, ...commentKeys];
  const previous = allKeys.map(key => process.env[key]);
  try {
    allKeys.forEach(key => delete process.env[key]);
    assert.equal((await POST(new Request("http://localhost", { method: "POST" }))).status, 503);
    process.env.META_LEAD_ADS_APP_SECRET = "offline-secret";
    assert.equal((await POST(new Request("http://localhost", { method: "POST" }))).status, 503, "partial Lead Ads config must not acknowledge and lose leadgen events");
    keys.forEach(key => delete process.env[key]);
    keys.forEach((key, i) => process.env[key] = ["offline-secret", "offline-verify", "offline-token", "100", "200"][i]);
    assert.equal((await GET(new Request("http://localhost/?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123"))).status, 403);
    const verified = await GET(new Request("http://localhost/?hub.mode=subscribe&hub.verify_token=offline-verify&hub.challenge=123"));
    assert.equal(verified.status, 200); assert.equal(await verified.text(), "123");
    assert.equal((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(payload) }))).status, 401);
    assert.equal((await POST(new Request("http://localhost", { method: "POST", body: "x".repeat(128 * 1024 + 1) }))).status, 413);
    const ignored = JSON.stringify({ ...payload, entry: [] });
    const signature = "sha256=" + createHmac("sha256", "offline-secret").update(ignored).digest("hex");
    assert.equal((await POST(new Request("http://localhost", { method: "POST", headers: { "x-hub-signature-256": signature }, body: ignored }))).status, 200);
  } finally { allKeys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
});
test("canonical Meta enquiries appear in the existing inbox and closed leads stay out", () => {
  const source = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  const start = source.indexOf("function canonicalMessengerLeadRows(");
  const body = source.slice(start, source.indexOf("\n}", start) + 2);
  const context: any = vm.createContext({ canonicalLeads: [
    { lead_id: "open", source: "meta_lead_ads", name: "Fixture", notes: "which_service: Solar", pipeline_status: { status_code: "NEW_LEAD" } },
    { lead_id: "closed", source: "meta_lead_ads", pipeline_status: { status_code: "CLOSED_LOST" } },
  ], canonicalConsultations: [], CANONICAL_OPEN_LEAD_STATUSES: new Set(["NEW_LEAD"]), websiteLeadUpdatesHtml: () => "" });
  vm.runInContext(body, context);
  const rows = context.canonicalMessengerLeadRows();
  assert.equal(rows.length, 1); assert.equal(rows[0].id, "open"); assert.equal(rows[0].message, "which_service: Solar");
});
