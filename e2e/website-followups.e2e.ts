import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { assertSafeE2eTarget, assertServerUsesTestDatabase } from "./guard";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
assertSafeE2eTarget(base);
const db = new PrismaClient();
const submission = `website-followups-${randomUUID()}`;
let leadId = "";
async function signed(method: string, payload: unknown, signatureOverride?: string) {
  const raw = JSON.stringify(payload), timestamp = String(Math.floor(Date.now() / 1000));
  assert.ok(process.env.WEBSITE_LEAD_INGEST_SECRET);
  const signature = signatureOverride || createHmac("sha256", process.env.WEBSITE_LEAD_INGEST_SECRET).update(`${timestamp}.${raw}`).digest("hex");
  const response = await fetch(base + "/api/v1/integrations/website/leads", { method, headers: { "content-type": "application/json", "x-rolan-timestamp": timestamp, "x-rolan-signature": signature }, body: raw });
  return { status: response.status, body: await response.json() };
}
before(async () => { await assertServerUsesTestDatabase(base, db); });
after(async () => {
  if (leadId) {
    await db.activityLog.deleteMany({ where: { entity_id: leadId } });
    await db.acquisitionTouchpoint.deleteMany({ where: { lead_id: leadId } });
    await db.consentSnapshot.deleteMany({ where: { lead_id: leadId } });
    await db.lead.deleteMany({ where: { lead_id: leadId } });
  }
  await db.$disconnect();
});
test("signed ordered follow-ups preserve one lead, human notes, original acquisition/consent and business stage", async () => {
  const original = { submission_id: submission, name: "Website fixture", email: "initial@example.com", notes: "Initial quote details", attribution: { google_ads_customer_id: "1234567890", google_ads_campaign_id: "123", gclid: "offline-fixture-only", captured_at: "2026-10-29T12:00:00Z", consent: { ad_user_data: "UNKNOWN", ad_personalization: "UNKNOWN", source: "offline-fixture" } } };
  const created = await signed("POST", original);
  assert.equal(created.status, 200); leadId = created.body.lead_id;
  const status = await db.pipelineStatus.findUniqueOrThrow({ where: { status_code: "CONTACTED" } });
  await db.lead.update({ where: { lead_id: leadId }, data: { notes: "Initial quote details\nHuman CRM note", pipeline_status_id: status.pipeline_status_id } });
  const before = await db.lead.findUniqueOrThrow({ where: { lead_id: leadId } });
  const points = await db.acquisitionTouchpoint.findMany({ where: { lead_id: leadId } });
  const consents = await db.consentSnapshot.findMany({ where: { lead_id: leadId } });
  const first = { submission_id: submission, event_id: randomUUID(), revision: 1, occurred_at: "2026-10-29T13:00:00+00:00", contact: { name: "Corrected fixture", email: "corrected@example.com" }, follow_up: { kind: "quote_updated", message: "Customer corrected email and selected Solar" } };
  const second = { ...first, event_id: randomUUID(), revision: 2, contact: {}, follow_up: { kind: "callback_requested", message: "Please call tomorrow; not a booked appointment" } };
  assert.equal((await signed("PATCH", first, "invalid")).status, 401);
  const missing = await signed("PATCH", { ...first, submission_id: submission + "-missing" });
  assert.equal(missing.body.error.code, "initial_submission_missing");
  assert.equal((await signed("PATCH", second)).body.error.code, "revision_gap");
  const concurrent = await Promise.all([signed("PATCH", first), signed("PATCH", first)]);
  assert.ok(concurrent.every(result => result.status === 200));
  assert.equal(concurrent.filter(result => result.body.applied).length, 1);
  assert.equal(concurrent.filter(result => result.body.duplicate).length, 1);
  assert.equal((await signed("PATCH", { ...first, follow_up: { ...first.follow_up, message: "changed replay" } })).body.error.code, "idempotency_conflict");
  assert.equal((await signed("PATCH", { ...first, event_id: randomUUID() })).body.error.code, "revision_conflict");
  assert.equal((await signed("PATCH", second)).body.applied, true);
  const late = await signed("PATCH", first);
  assert.equal(late.body.current_revision, 2); assert.equal(late.body.duplicate, true); assert.equal(late.body.applied, false);
  assert.equal((await signed("POST", original)).body.duplicate, true);
  const after = await db.lead.findUniqueOrThrow({ where: { lead_id: leadId } });
  assert.equal(after.email, "corrected@example.com");
  assert.equal(after.name, "Corrected fixture");
  for (const key of ["notes", "pipeline_status_id", "assigned_manager_id", "source", "external_source", "external_submission_id"] as const) assert.equal(after[key], before[key]);
  assert.deepEqual(await db.acquisitionTouchpoint.findMany({ where: { lead_id: leadId } }), points);
  assert.deepEqual(await db.consentSnapshot.findMany({ where: { lead_id: leadId } }), consents);
  assert.equal(await db.lead.count({ where: { external_submission_id: { startsWith: submission } } }), 1);
  const receipts = await db.activityLog.findMany({ where: { entity_id: leadId, action_key: "integration.website.lead_update" } });
  assert.equal(receipts.length, 2);
  assert.equal(await db.conversionEvent.count({ where: { lead_id: leadId } }), 0);
  assert.equal(await db.consultation.count({ where: { lead_id: leadId } }), 0);
  assert.equal(await db.deal.count({ where: { lead_id: leadId } }), 0);
  assert.equal((receipts[0].metadata as any).before_image_source, "observed_before_update");
});
