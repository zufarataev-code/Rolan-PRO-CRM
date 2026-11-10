/** Disposable database only; the provider is mocked and no Meta requests occur. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../src/lib/db";
import { POST } from "../app/api/webhooks/meta-lead-ads/route";
import { assertSafeE2eTarget, assertServerUsesTestDatabase } from "./guard";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
assertSafeE2eTarget(base);
const providerIdPrefix = String(Date.now());
const canonicalIds: string[] = [];
const metaEnv = {
  META_LEAD_ADS_APP_SECRET: "offline-secret",
  META_LEAD_ADS_PAGE_ACCESS_TOKEN: "offline-token",
  META_LEAD_ADS_PAGE_ID: "100",
  META_LEAD_ADS_FORM_IDS: "200",
};
const previousMetaEnv = Object.fromEntries(Object.keys(metaEnv).map(key => [key, process.env[key]]));
const previousWelcomeSms = process.env.LEAD_WELCOME_SMS_ENABLED;
before(async () => {
  await assertServerUsesTestDatabase(base, prisma);
  process.env.LEAD_WELCOME_SMS_ENABLED = "false";
  Object.assign(process.env, metaEnv);
});
after(async () => {
  if (previousWelcomeSms === undefined) delete process.env.LEAD_WELCOME_SMS_ENABLED;
  else process.env.LEAD_WELCOME_SMS_ENABLED = previousWelcomeSms;
  for (const [key, value] of Object.entries(previousMetaEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const canonicalId of canonicalIds) {
    await prisma.activityLog.deleteMany({ where: { entity_id: canonicalId } });
    await prisma.acquisitionTouchpoint.deleteMany({ where: { lead_id: canonicalId } });
    await prisma.consentSnapshot.deleteMany({ where: { lead_id: canonicalId } });
    await prisma.lead.delete({ where: { lead_id: canonicalId } });
  }
  await prisma.$disconnect();
});
const emailCases = [
  { label: "omitted email", fields: [] },
  { label: "blank email", fields: [{ name: "email", values: [""] }] },
  { label: "empty email answers", fields: [{ name: "email", values: [] }] },
  { label: "unanswered email", fields: [{ name: "email" }] },
];
for (const [index, emailCase] of emailCases.entries()) {
  test(`signed concurrent deliveries with ${emailCase.label} commit one complete enquiry`, async t => {
    const leadId = providerIdPrefix + String(index) + "987";
    process.env.META_LEAD_ADS_PAGE_ACCESS_TOKEN = "offline-token";
    const body = JSON.stringify({ object: "page", entry: [{ id: "100", changes: [{ field: "leadgen", value: { page_id: "100", form_id: "200", leadgen_id: leadId, ad_id: "300" } }] }] });
    const signature = "sha256=" + createHmac("sha256", "offline-secret").update(body).digest("hex");
    const deliver = () => POST(new Request(`${base}/api/webhooks/meta-lead-ads`, { method: "POST", headers: { "x-hub-signature-256": signature }, body }));
    const provider = t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
      assert.equal(url.origin, "https://graph.facebook.com");
      assert.equal(url.pathname, `/v26.0/${leadId}`);
      assert.equal(options.headers && (options.headers as Record<string, string>).authorization, "Bearer offline-token");
      assert.equal(url.searchParams.has("access_token"), false);
      assert.equal(url.searchParams.get("appsecret_proof"), createHmac("sha256", "offline-secret").update("offline-token").digest("hex"));
      return Response.json({ id: leadId, form_id: "200", ad_id: "300", adset_id: "400", campaign_id: "500", created_time: new Date().toISOString(), field_data: [{ name: "full_name", values: ["Offline Meta fixture"] }, { name: "phone_number", values: ["2025550123"] }, { name: "zip_code", values: ["90210"] }, { name: "service", values: ["Privacy Film"] }, ...emailCase.fields, { name: "inbox_url" }] });
    });
    const responses = await Promise.all([deliver(), deliver()]);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { external_source_external_submission_id: { external_source: "meta_lead_ads", external_submission_id: leadId } }, include: { pipeline_status: true } });
    const canonicalId = lead.lead_id;
    canonicalIds.push(canonicalId);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, received: 1 });
    }
    assert.equal(lead.source, "meta_lead_ads"); assert.equal(lead.pipeline_status.status_code, "NEW_LEAD");
    assert.equal(lead.phone, "+12025550123"); assert.equal(lead.email, null);
    assert.equal(lead.name, "Offline Meta fixture");
    assert.match(lead.notes!, /zip_code: 90210/);
    assert.match(lead.notes!, /service: Privacy Film/);
    assert.equal(await prisma.activityLog.count({ where: { entity_id: canonicalId } }), 1);
    const touches = await prisma.acquisitionTouchpoint.findMany({ where: { lead_id: canonicalId } });
    assert.equal(touches.length, 1); assert.equal((touches[0].session_attributes as any).campaign_id, "500");
    const consent = await prisma.consentSnapshot.findMany({ where: { lead_id: canonicalId } });
    assert.equal(consent.length, 1); assert.equal(consent[0].ad_user_data, "UNKNOWN"); assert.equal(consent[0].audience_marketing_eligible, false);
    assert.equal(await prisma.conversionEvent.count({ where: { lead_id: canonicalId } }), 0);
    assert.equal(await prisma.consultation.count({ where: { lead_id: canonicalId } }), 0);
    await prisma.lead.update({ where: { lead_id: canonicalId }, data: { notes: "Staff notes stay intact" } });
    const reads = provider.mock.callCount();
    process.env.META_LEAD_ADS_PAGE_ACCESS_TOKEN = "expired-offline-token";
    const retry = await deliver();
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), { ok: true, received: 1 });
    assert.equal(provider.mock.callCount(), reads);
    assert.equal((await prisma.lead.findUniqueOrThrow({ where: { lead_id: canonicalId } })).notes, "Staff notes stay intact");
    assert.equal(await prisma.activityLog.count({ where: { entity_id: canonicalId } }), 1);
  });
}
