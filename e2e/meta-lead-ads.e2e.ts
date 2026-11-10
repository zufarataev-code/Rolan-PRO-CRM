/** Disposable database only; the provider is mocked and no Meta requests occur. */
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { prisma } from "../src/lib/db";
import { importMetaLead } from "../src/features/integrations/meta-lead-ads";
import { assertSafeE2eTarget, assertServerUsesTestDatabase } from "./guard";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
assertSafeE2eTarget(base);
const leadId = String(Date.now()) + "987";
const notification = { lead_id: leadId, page_id: "100", form_id: "200", ad_id: "300" };
let canonicalId: string | undefined;
before(async () => { await assertServerUsesTestDatabase(base, prisma); });
after(async () => {
  mock.restoreAll();
  if (canonicalId) {
    await prisma.activityLog.deleteMany({ where: { entity_id: canonicalId } });
    await prisma.acquisitionTouchpoint.deleteMany({ where: { lead_id: canonicalId } });
    await prisma.consentSnapshot.deleteMany({ where: { lead_id: canonicalId } });
    await prisma.lead.delete({ where: { lead_id: canonicalId } });
  }
  await prisma.$disconnect();
});
test("concurrent deliveries commit one canonical enquiry, receipt and attribution, with no downstream conversions", async () => {
  const provider = mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(url.origin, "https://graph.facebook.com");
    assert.equal(url.pathname, `/v26.0/${leadId}`);
    assert.equal(options.headers && (options.headers as Record<string, string>).authorization, "Bearer offline-token");
    assert.equal(url.searchParams.has("access_token"), false);
    return Response.json({ id: leadId, form_id: "200", ad_id: "300", adset_id: "400", campaign_id: "500", created_time: new Date().toISOString(), field_data: [{ name: "phone_number", values: ["2025550123"] }] });
  });
  const results = await Promise.all([importMetaLead(notification, "offline-token", "offline-secret"), importMetaLead(notification, "offline-token", "offline-secret")]);
  canonicalId = results[0].lead_id;
  assert.equal(results[1].lead_id, canonicalId);
  assert.equal(results.filter(result => result.duplicate).length, 1);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { lead_id: canonicalId }, include: { pipeline_status: true } });
  assert.equal(lead.source, "meta_lead_ads"); assert.equal(lead.pipeline_status.status_code, "NEW_LEAD");
  assert.equal(lead.phone, "+12025550123"); assert.equal(lead.email, null);
  assert.equal(lead.name, "+12025550123"); assert.equal(lead.first_name, null); assert.equal(lead.last_name, null);
  assert.doesNotMatch(lead.notes!, /service:|zip_code:/);
  assert.equal(await prisma.activityLog.count({ where: { entity_id: canonicalId } }), 1);
  const touches = await prisma.acquisitionTouchpoint.findMany({ where: { lead_id: canonicalId } });
  assert.equal(touches.length, 1); assert.equal((touches[0].session_attributes as any).campaign_id, "500");
  const consent = await prisma.consentSnapshot.findMany({ where: { lead_id: canonicalId } });
  assert.equal(consent.length, 1); assert.equal(consent[0].ad_user_data, "UNKNOWN"); assert.equal(consent[0].audience_marketing_eligible, false);
  assert.equal(await prisma.conversionEvent.count({ where: { lead_id: canonicalId } }), 0);
  assert.equal(await prisma.consultation.count({ where: { lead_id: canonicalId } }), 0);
  await prisma.lead.update({ where: { lead_id: canonicalId }, data: { notes: "Staff notes stay intact" } });
  const reads = provider.mock.callCount();
  assert.equal((await importMetaLead(notification, "expired-token", "offline-secret")).duplicate, true);
  assert.equal(provider.mock.callCount(), reads);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { lead_id: canonicalId } })).notes, "Staff notes stay intact");
});
