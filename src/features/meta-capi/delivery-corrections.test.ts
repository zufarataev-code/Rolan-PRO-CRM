import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/db";
import { processNextMetaCapiEvent, runMetaCapiSyncCycle } from "./processor";

async function fixture(run: (state: { row: any; sale: any; writes: any[]; submissions: any[]; network: { response: () => Response | Promise<Response> }; }) => Promise<void>) {
  const env = { ...process.env }, originalFetch = globalThis.fetch;
  const originals = {
    findFirst: prisma.metaCapiOutbox.findFirst, updateMany: prisma.metaCapiOutbox.updateMany,
    leadFind: prisma.lead.findUnique, saleFind: prisma.conversionEvent.findUnique,
    workspaceFind: prisma.legacyWorkspace.findUnique, pointsFind: prisma.acquisitionTouchpoint.findMany,
  };
  const occurredAt = new Date();
  const payload = { event_name: "ConvertedLead", event_time: Math.floor(occurredAt.getTime() / 1000), event_id: "sale-event", action_source: "system_generated", user_data: { lead_id: "1234567890123456" }, custom_data: { event_source: "crm", lead_event_source: "RolanPRO CRM", value: 1000, currency: "USD" } };
  const state = {
    row: { meta_capi_outbox_id: "row", lead_id: "lead", conversion_event_id: "sale", event_name: "ConvertedLead", event_id: "sale-event", occurred_at: occurredAt, attempt_count: 0, dataset_id: "123", payload_snapshot: payload, test_accepted_at: null } as any,
    sale: { conversion_value: "1000.00", adjustments: [] } as any,
    writes: [] as any[], submissions: [] as any[], network: { response: (): Response | Promise<Response> => Response.json({ events_received: 1 }) },
  };
  try {
    process.env.META_CAPI_DATASET_ID = "123"; process.env.META_CAPI_ACCESS_TOKEN = "fixture-token"; process.env.META_CAPI_UPLOAD_ENABLED = "true";
    delete process.env.META_CAPI_TEST_EVENT_CODE;
    (prisma.metaCapiOutbox as any).findFirst = async () => structuredClone(state.row);
    (prisma.metaCapiOutbox as any).updateMany = async (args: any) => {
      state.writes.push(args);
      if (args.data.payload_snapshot) state.row.payload_snapshot = structuredClone(args.data.payload_snapshot);
      if (args.data.attempt_count) state.row.attempt_count += args.data.attempt_count.increment;
      if (args.data.test_accepted_at) state.row.test_accepted_at = args.data.test_accepted_at;
      return { count: 1 };
    };
    (prisma.lead as any).findUnique = async () => ({ consent_snapshots: [] });
    (prisma.conversionEvent as any).findUnique = async () => state.sale;
    (prisma.legacyWorkspace as any).findUnique = async () => null;
    (prisma.acquisitionTouchpoint as any).findMany = async () => [];
    globalThis.fetch = async (_url, init) => {
      const submitted = JSON.parse(String(init?.body));
      assert.deepEqual(submitted.data[0], state.row.payload_snapshot, "actual outgoing payload is durable before HTTP");
      state.submissions.push(submitted);
      return state.network.response();
    };
    await run(state);
  } finally {
    for (const key of ["META_CAPI_DATASET_ID", "META_CAPI_ACCESS_TOKEN", "META_CAPI_UPLOAD_ENABLED", "META_CAPI_TEST_EVENT_CODE"]) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
    globalThis.fetch = originalFetch;
    prisma.metaCapiOutbox.findFirst = originals.findFirst; prisma.metaCapiOutbox.updateMany = originals.updateMany;
    prisma.lead.findUnique = originals.leadFind; prisma.conversionEvent.findUnique = originals.saleFind;
    prisma.legacyWorkspace.findUnique = originals.workspaceFind; prisma.acquisitionTouchpoint.findMany = originals.pointsFind;
  }
}

test("first sale submission snapshots the latest positive restated value and retries it unchanged", async () => {
  await fixture(async state => {
    state.sale.adjustments = [{ adjustment_type: "RESTATEMENT", adjusted_value: "650.00" }, { adjustment_type: "RESTATEMENT", adjusted_value: "800.00" }];
    state.network.response = async () => { throw new Error("unknown network outcome"); };
    assert.deepEqual(await processNextMetaCapiEvent(), { status: "retry", code: "network_or_timeout" });
    assert.equal(state.row.payload_snapshot.custom_data.value, 650);
    assert.equal(state.submissions[0].data[0].event_id, "sale-event");
    state.network.response = () => Response.json({ events_received: 1 });
    assert.deepEqual(await processNextMetaCapiEvent(), { status: "accepted", code: null });
    assert.deepEqual(state.submissions[0].data, state.submissions[1].data);
  });
});

test("a financial change after an uncertain or test attempt needs operator review", async () => {
  for (const testAttempt of [false, true]) await fixture(async state => {
    if (testAttempt) process.env.META_CAPI_TEST_EVENT_CODE = "TEST123";
    state.network.response = testAttempt ? () => Response.json({ events_received: 1 }) : async () => { throw new Error("unknown outcome"); };
    await processNextMetaCapiEvent();
    delete process.env.META_CAPI_TEST_EVENT_CODE;
    state.sale.adjustments = [{ adjustment_type: "RESTATEMENT", adjusted_value: "900.00" }];
    assert.deepEqual(await processNextMetaCapiEvent(), { status: "needs_operator_action", code: "sale_value_changed_after_attempt" });
    assert.equal(state.submissions.length, 1);
    assert.equal(state.row.payload_snapshot.custom_data.value, 1000);
  });
});

test("retracted and fully refunded sales never reach HTTP", async () => {
  for (const adjustment of [{ adjustment_type: "RETRACTION", adjusted_value: null }, { adjustment_type: "RESTATEMENT", adjusted_value: "0.00" }]) await fixture(async state => {
    state.sale.adjustments = [adjustment];
    const result = await processNextMetaCapiEvent();
    assert.equal(result.status, "suppressed");
    assert.equal(state.submissions.length, 0);
  });
});

test("systemic credential and permission failures stop the batch after one event", async () => {
  for (const attemptCount of [0, 7]) for (const failure of [{ code: 190 }, { code: 200 }, { code: 190, http: 200 }, { http: 401 }, { http: 403 }]) await fixture(async state => {
    state.row.attempt_count = attemptCount;
    state.network.response = () => Response.json("code" in failure ? { error: { code: failure.code } } : {}, { status: "http" in failure ? failure.http : 400 });
    const result = await runMetaCapiSyncCycle({ limit: 25 });
    assert.equal(result.results.length, 1);
    assert.equal(state.submissions.length, 1);
    assert.equal("code" in result.results[0] && result.results[0].code, "code" in failure ? `graph_${failure.code}` : `http_${failure.http}`);
  });
});
