import assert from "node:assert/strict";
import test from "node:test";
import { sha256Hex } from "@/features/google-ads/normalization";
import { prisma } from "@/lib/db";
import { enqueueConvertedLead, enqueueLeadStage } from "./events";
import { buildMetaCrmPayload, metaEventTimeError, metaRetryDelayMs, type MetaEventPayload } from "./payload";
import { deliverMetaEvent, metaCapiConfiguration, processNextMetaCapiEvent } from "./processor";

const occurredAt = new Date("2026-11-17T20:00:00Z");
const input = { source: "meta_lead_ads", nativeLeadId: "1234567890123456", email: " Person@Example.COM ", phone: "+1 (805) 555-0100", consent: "UNKNOWN", eventName: "QualifiedLead", eventId: "fixture", occurredAt, generatedAt: new Date("2026-11-16T20:00:00Z") };
const payload = buildMetaCrmPayload(input).payload!;

test("native Meta lead matching preserves unknown consent and CRM contract", () => {
  assert.equal(payload.action_source, "system_generated");
  assert.deepEqual(payload.user_data, { lead_id: "1234567890123456" });
  assert.deepEqual(payload.custom_data, { event_source: "crm", lead_event_source: "RolanPRO CRM" });
  assert.equal(payload.event_time, 1794945600);
  assert.equal(buildMetaCrmPayload({ ...input, consent: "DENIED" }).reason, "consent_denied");
  assert.equal(buildMetaCrmPayload({ ...input, source: "website" }).reason, "consent_not_granted");
  assert.equal(buildMetaCrmPayload({ ...input, source: "facebook_messenger" }).reason, "unsupported_source");
  assert.equal(buildMetaCrmPayload({ ...input, nativeLeadId: null }).reason, "missing_matching_data");
  assert.equal(buildMetaCrmPayload({ ...input, occurredAt: new Date("2026-11-15") }).reason, "invalid_event_time");
});

test("contact matching hashes only explicitly permitted normalized identifiers", () => {
  const result = buildMetaCrmPayload({ ...input, nativeLeadId: null, consent: "GRANTED" }).payload!;
  assert.deepEqual(result.user_data, { em: [sha256Hex("person@example.com")], ph: [sha256Hex("18055550100")] });
  assert.equal(JSON.stringify(result).includes("Person@"), false);
  assert.equal(buildMetaCrmPayload({ ...input, eventName: "ConvertedLead" }).reason, "unverified_sale_value");
  assert.equal(buildMetaCrmPayload({ ...input, eventName: "ConvertedLead", value: 250, currency: "USD" }).payload?.custom_data.value, 250);
});

test("events retain timestamps, expire after seven days, and retries are bounded", () => {
  assert.equal(metaEventTimeError(occurredAt, new Date(occurredAt.getTime() + 7 * 86400000)), null);
  assert.equal(metaEventTimeError(occurredAt, new Date(occurredAt.getTime() + 7 * 86400000 + 1)), "event_too_old");
  assert.equal(metaRetryDelayMs(1), 60000);
  assert.equal(metaRetryDelayMs(100), 6 * 60 * 60 * 1000);
  assert.equal(metaCapiConfiguration({ META_CAPI_UPLOAD_ENABLED: "TRUE" }).enabled, false);
  assert.equal(metaCapiConfiguration({ META_CAPI_DATASET_ID: "not-an-id" }).datasetId, null);
});

test("ordinary web and phone stage feedback requires consent and does not invent browser or call interactions", () => {
  const call = buildMetaCrmPayload({ ...input, source: "callrail", consent: "GRANTED" }).payload!;
  assert.equal(call.action_source, "system_generated");
  assert.equal(call.user_data.lead_id, undefined);
  assert.deepEqual(call.custom_data, {});
  assert.ok(call.user_data.ph?.length);
  const web = buildMetaCrmPayload({ ...input, source: "website", consent: "GRANTED" }).payload!;
  assert.equal(web.action_source, "system_generated");
  assert.equal("event_source_url" in web, false);
  assert.equal("client_user_agent" in web.user_data, false);
  assert.equal(web.custom_data.event_source, undefined);
});

test("signed website importer provenance reaches ordinary CAPI after recorded consent", async () => {
  let queued: any;
  const tx: any = {
    lead: { findUnique: async () => ({ lead_id: "website", source: "website", external_source: "rolanpro.com", external_submission_id: "submission-not-a-meta-id", created_at: input.generatedAt, consent_snapshots: [{ ad_user_data: "GRANTED", ad_personalization: "UNKNOWN" }], phone: input.phone, email: input.email }) },
    metaCapiOutbox: { upsert: async ({ create }: any) => { queued = create; return create; } },
  };
  await enqueueLeadStage(tx, { leadId: "website", stageCode: "QUALIFIED", occurredAt });
  assert.equal(queued.processing_status, "queued");
  assert.equal(queued.payload_snapshot.event_name, "QualifiedLead");
  assert.equal(queued.payload_snapshot.user_data.lead_id, undefined);
  assert.ok(queued.payload_snapshot.user_data.ph?.length);
  assert.deepEqual(queued.payload_snapshot.custom_data, {});
});

test("one qualified milestone per lead survives re-entry; sale requires the verified producer", async () => {
  const saved = new Map<string, any>();
  const tx: any = {
    lead: { findUnique: async () => ({ lead_id: "lead", external_source: "meta_lead_ads", external_submission_id: input.nativeLeadId, created_at: input.generatedAt, consent_snapshots: [], acquisition_touchpoints: [], phone: null, email: null }) },
    metaCapiOutbox: { upsert: async ({ where, create, update }: any) => { assert.deepEqual(update, {}); if (!saved.has(where.event_id)) saved.set(where.event_id, create); return saved.get(where.event_id); } },
    conversionEvent: { findUnique: async () => ({ conversion_event_id: "sale", event_type: "converted_lead", lead_id: "lead", transaction_id: "verified-sale", occurred_at: occurredAt, conversion_value: 250, currency: "USD", adjustments: [] }) },
    activityLog: { findFirst: async () => null },
  };
  await enqueueLeadStage(tx, { leadId: "lead", stageCode: "QUALIFIED", occurredAt, eventId: "audit-1" });
  await enqueueLeadStage(tx, { leadId: "lead", stageCode: "QUALIFIED", occurredAt: new Date(occurredAt.getTime() + 1000), eventId: "audit-2" });
  assert.equal(saved.size, 1);
  assert.equal(await enqueueLeadStage(tx, { leadId: "lead", stageCode: "CLOSED_WON", occurredAt }), null);
  await enqueueLeadStage(tx, { leadId: "lead", stageCode: "DEPOSIT_PAID", occurredAt, eventId: "audit-3" });
  assert.equal(saved.get("crm-stage-audit-3").event_name, "DepositPaid");
  await enqueueConvertedLead(tx, { conversionEventId: "sale" });
  assert.equal(saved.get("verified-sale").event_name, "ConvertedLead");
});

test("Graph acceptance requires one received event; retries keep event_id and redact errors", async () => {
  const calls: any[] = [];
  const fetcher: typeof fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ events_received: 1 }); };
  assert.deepEqual(await deliverMetaEvent({ datasetId: "123", token: "private-token", testCode: "TEST123", payload }, fetcher), { status: "accepted", code: null });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.test_event_code, "TEST123");
  assert.equal(body.data[0].event_id, "fixture");
  assert.equal(calls[0].url.includes("private-token"), false);
  assert.deepEqual(await deliverMetaEvent({ datasetId: "123", token: "private-token", testCode: null, payload }, async () => Response.json({ events_received: 0 })), { status: "retry", code: "unconfirmed_acceptance" });
  assert.deepEqual(await deliverMetaEvent({ datasetId: "123", token: "private-token", testCode: null, payload }, async () => Response.json({ error: { code: 190, message: "private-token contact@example.com" } }, { status: 400 })), { status: "retry", code: "graph_190" });
  assert.deepEqual(await deliverMetaEvent({ datasetId: "123", token: "private-token", testCode: null, payload }, async () => { throw new Error("private-token"); }), { status: "retry", code: "network_or_timeout" });
});

test("existing native leads recover raw receipt with its persisted original timestamp", async () => {
  const saved = new Map<string, any>();
  const receiptAt = new Date("2026-11-16T21:00:00Z");
  const tx: any = {
    lead: { findUnique: async () => ({ lead_id: "existing-lead", external_source: "meta_lead_ads", external_submission_id: input.nativeLeadId, created_at: input.generatedAt, consent_snapshots: [], phone: null, email: null }) },
    activityLog: { findFirst: async () => ({ created_at: receiptAt }) },
    metaCapiOutbox: { upsert: async ({ where, create }: any) => { if (!saved.has(where.event_id)) saved.set(where.event_id, create); return saved.get(where.event_id); } },
  };
  await enqueueLeadStage(tx, { leadId: "existing-lead", stageCode: "NEW_LEAD", occurredAt, eventId: "reopened" });
  assert.equal(saved.get("crm-stage-reopened").event_name, "LeadReopened");
  await enqueueLeadStage(tx, { leadId: "existing-lead", stageCode: "QUALIFIED", occurredAt });
  assert.equal(saved.size, 3);
  const raw = saved.get("crm-lead-existing-lead-Lead");
  assert.equal(raw.occurred_at, receiptAt);
  assert.equal(raw.payload_snapshot.event_time, Math.floor(receiptAt.getTime() / 1000));
  assert.equal(saved.get("crm-lead-existing-lead-QualifiedLead").occurred_at, occurredAt);
});

test("worker claims before sending, rechecks consent and releases the exact lease", async () => {
  const savedEnv = { ...process.env };
  const originals = { findFirst: prisma.metaCapiOutbox.findFirst, updateMany: prisma.metaCapiOutbox.updateMany, leadFind: prisma.lead.findUnique };
  const updates: any[] = [];
  try {
    process.env.META_CAPI_DATASET_ID = "123"; process.env.META_CAPI_ACCESS_TOKEN = "fixture-token"; process.env.META_CAPI_UPLOAD_ENABLED = "true";
    (prisma.metaCapiOutbox as any).findFirst = async () => ({ meta_capi_outbox_id: "row", lead_id: "lead", event_name: "QualifiedLead", event_id: "fixture", occurred_at: new Date(), attempt_count: 0, dataset_id: null, payload_snapshot: payload });
    (prisma.metaCapiOutbox as any).updateMany = async (args: any) => { updates.push(args); return { count: 1 }; };
    (prisma.lead as any).findUnique = async () => ({ consent_snapshots: [{ ad_user_data: "DENIED" }] });
    assert.deepEqual(await processNextMetaCapiEvent(), { status: "suppressed", code: "consent_denied" });
    assert.equal(updates[0].data.processing_status, "processing");
    assert.equal(updates[0].data.lease_token, updates[1].where.lease_token);
    assert.equal(updates[1].data.lease_token, null);
    (prisma.metaCapiOutbox as any).updateMany = async () => ({ count: 0 });
    assert.deepEqual(await processNextMetaCapiEvent(), { status: "busy" });
  } finally {
    for (const key of ["META_CAPI_DATASET_ID", "META_CAPI_ACCESS_TOKEN", "META_CAPI_UPLOAD_ENABLED", "META_CAPI_TEST_EVENT_CODE"]) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
    prisma.metaCapiOutbox.findFirst = originals.findFirst; prisma.metaCapiOutbox.updateMany = originals.updateMany; prisma.lead.findUnique = originals.leadFind;
  }
});

test("worker preserves event identity across retry, separates test acceptance, and suppresses retracted sales", async () => {
  const savedEnv = { ...process.env }, originalFetch = globalThis.fetch;
  const originals = { findFirst: prisma.metaCapiOutbox.findFirst, updateMany: prisma.metaCapiOutbox.updateMany, leadFind: prisma.lead.findUnique, saleFind: prisma.conversionEvent.findUnique };
  const now = new Date();
  const event: MetaEventPayload = { ...payload, event_time: Math.floor(now.getTime() / 1000) };
  let retracted = false, received = 0;
  const updates: any[] = [], submitted: any[] = [];
  const row: any = { meta_capi_outbox_id: "row", lead_id: "lead", conversion_event_id: null, event_name: "QualifiedLead", event_id: "fixture", occurred_at: now, attempt_count: 0, dataset_id: "123", payload_snapshot: event };
  try {
    process.env.META_CAPI_DATASET_ID = "123"; process.env.META_CAPI_ACCESS_TOKEN = "fixture-token"; process.env.META_CAPI_UPLOAD_ENABLED = "true"; process.env.META_CAPI_TEST_EVENT_CODE = "TEST123";
    (prisma.metaCapiOutbox as any).findFirst = async () => row;
    (prisma.metaCapiOutbox as any).updateMany = async (args: any) => { updates.push(args); return { count: 1 }; };
    (prisma.lead as any).findUnique = async () => ({ consent_snapshots: [] });
    (prisma.conversionEvent as any).findUnique = async () => ({ conversion_value: 250, adjustments: retracted ? [{ adjustment_type: "RETRACTION" }] : [] });
    globalThis.fetch = async (_url, init) => { submitted.push(JSON.parse(String(init?.body))); return Response.json({ events_received: received }); };
    assert.deepEqual(await processNextMetaCapiEvent(), { status: "retry", code: "unconfirmed_acceptance" });
    assert.ok(updates.at(-1).data.next_attempt_at > now);
    received = 1;
    assert.deepEqual(await processNextMetaCapiEvent(), { status: "test_accepted", code: null });
    assert.equal(updates.at(-1).data.accepted_at, undefined);
    assert.ok(updates.at(-1).data.test_accepted_at);
    delete process.env.META_CAPI_TEST_EVENT_CODE;
    assert.deepEqual(await processNextMetaCapiEvent(), { status: "accepted", code: null });
    assert.equal(submitted[0].data[0].event_id, submitted[2].data[0].event_id);
    assert.equal(submitted[2].test_event_code, undefined);
    assert.ok(updates.at(-1).data.accepted_at);
    row.event_name = "ConvertedLead"; row.conversion_event_id = "sale"; retracted = true;
    const countBefore = submitted.length;
    assert.deepEqual(await processNextMetaCapiEvent(), { status: "suppressed", code: "sale_retracted" });
    assert.equal(submitted.length, countBefore);
  } finally {
    for (const key of ["META_CAPI_DATASET_ID", "META_CAPI_ACCESS_TOKEN", "META_CAPI_UPLOAD_ENABLED", "META_CAPI_TEST_EVENT_CODE"]) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
    globalThis.fetch = originalFetch;
    prisma.metaCapiOutbox.findFirst = originals.findFirst; prisma.metaCapiOutbox.updateMany = originals.updateMany; prisma.lead.findUnique = originals.leadFind; prisma.conversionEvent.findUnique = originals.saleFind;
  }
});
