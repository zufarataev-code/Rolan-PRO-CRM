import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reconcileLegacyGoogleAdsOutcomes } from "./legacy-outcomes";

test("actual proposal sharing qualifies once, while publishing its link does not", async t => {
  const replace = (model: any, method: string, implementation: any) => {
    const original = model[method];
    model[method] = implementation;
    t.after(() => { model[method] = original; });
  };
  const order = { id: "shared-proposal", timeline: [{ key: "premium_proposal_published", at: "2026-10-01T10:00:00Z" }] };
  const point = { legacy_order_id: order.id, lead_id: "lead-1", client_id: "client-1", acquisition_touchpoint_id: "touchpoint-1" };
  const events: any[] = [], outboxes: any[] = [];
  const tx = {
    $executeRaw: async () => 1,
    deal: { findFirst: async () => null },
    googleAdsIntegrationSetting: { findUnique: async () => ({
      conversion_owner_customer_id: "1234567890", qualified_lead_action_id: "123",
      qualification_rules: { pipeline_status_code: "PROPOSAL_SENT" }, rule_version: "v1",
    }) },
    conversionEvent: {
      findFirst: async ({ where }: any) => where.event_type === "qualified_lead" ? events[0] ?? null : null,
      upsert: async ({ create, update }: any) => {
        assert.deepEqual(update, {}, "existing outcome facts stay immutable");
        const existing = events.find(event => event.transaction_id === create.transaction_id);
        if (existing) return existing;
        const event = { ...create, conversion_event_id: "qualified-1" };
        events.push(event);
        return event;
      },
    },
    conversionUploadOutbox: { upsert: async ({ create, update }: any) => {
      assert.deepEqual(update, {}, "existing delivery history stays immutable");
      const existing = outboxes.find(row => row.transaction_id === create.transaction_id);
      if (existing) return existing;
      outboxes.push(create);
      return create;
    } },
  };
  replace(prisma.legacyWorkspace, "findUnique", async () => ({ payload: { orders: [order] } }));
  replace(prisma.acquisitionTouchpoint, "findMany", async () => [point]);
  replace(prisma, "$transaction", async (callback: any) => callback(tx));
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("This test must stay offline."); });
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  assert.equal(events.length, 0, "a prepared public link is not evidence of sharing");
  order.timeline.push({ key: "premium_proposal_sent", at: "2026-10-01T11:00:00Z" });
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  const recorded = structuredClone({ event: events[0], outbox: outboxes[0] });
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, "qualified_lead");
  assert.equal(events[0].occurred_at.toISOString(), "2026-10-01T11:00:00.000Z");
  assert.equal(outboxes.length, 1);
  order.timeline.push({ key: "proposal_sent", at: "2026-10-01T12:00:00Z" });
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  assert.equal(events.length, 1, "the ordinary sharing event reuses the same outcome");
  assert.equal(outboxes.length, 1);
  assert.deepEqual({ event: events[0], outbox: outboxes[0] }, recorded);
  assert.equal(network.mock.callCount(), 0);
});

function fixture(t: TestContext) {
  const replace = (model: any, method: string, implementation: any) => {
    const original = model[method];
    model[method] = implementation;
    t.after(() => { model[method] = original; });
  };
  const order = { id: "refund-project", status: "completed" };
  const payload = { orders: [order], finance: { transactions: [] as any[] } };
  const original = { conversion_event_id: "original-sale", event_type: "converted_lead", transaction_id: "crm-project-refund-project-sale", conversion_value: new Prisma.Decimal(1000), currency: "USD" };
  const adjustments: any[] = [], outboxes: any[] = [];
  replace(prisma, "$transaction", async (callback: any) => callback(prisma));
  replace(prisma, "$executeRaw", async () => 1);
  replace(prisma.legacyWorkspace, "findUnique", async () => ({ payload }));
  replace(prisma.acquisitionTouchpoint, "findMany", async () => []);
  replace(prisma.conversionEvent, "findFirst", async () => original);
  replace(prisma.conversionEvent, "findUnique", async () => original);
  replace(prisma.conversionAdjustment, "findFirst", async ({ orderBy }: any) => {
    assert.deepEqual(orderBy, [{ adjustment_type: "desc" }, { occurred_at: "desc" }, { created_at: "desc" }]);
    return [...adjustments].reverse().sort((left, right) =>
      right.adjustment_type.localeCompare(left.adjustment_type)
      || (right.occurred_at?.getTime() ?? 0) - (left.occurred_at?.getTime() ?? 0)
      || (right.created_at?.getTime() ?? 0) - (left.created_at?.getTime() ?? 0)
    )[0] ?? null;
  });
  replace(prisma.conversionAdjustment, "count", async () => adjustments.length);
  replace(prisma.conversionAdjustment, "findUnique", async ({ where }: any) => {
    const key = where.conversion_event_id_financial_reference_id_adjustment_type;
    return adjustments.find(item => Object.entries(key).every(([field, value]) => item[field] === value)) ?? null;
  });
  replace(prisma.conversionAdjustment, "create", async ({ data }: any) => {
    const adjustment = { ...data, conversion_adjustment_id: `correction-${adjustments.length + 1}` };
    adjustments.push(adjustment);
    return adjustment;
  });
  replace(prisma.googleAdsIntegrationSetting, "findUnique", async () => ({ conversion_owner_customer_id: "1234567890", converted_lead_action_id: "123", upload_enabled: false }));
  replace(prisma.conversionAdjustmentOutbox, "findFirst", async ({ where }: any) => outboxes.find(item => item.conversion_adjustment_id === where.conversion_adjustment_id) ?? null);
  replace(prisma.conversionAdjustmentOutbox, "upsert", async ({ create, update }: any) => {
    assert.deepEqual(update, {}, "delivery history must not be rewritten");
    const row = { ...create, conversion_adjustment_outbox_id: `delivery-${outboxes.length + 1}` };
    outboxes.push(row);
    return row;
  });
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("This test must stay offline."); });
  t.after(() => { assert.equal(network.mock.callCount(), 0); });
  return { order, payload, original, adjustments, outboxes };
}

test("removing the last refund appends one restoration without rewriting prior corrections or the sale", async t => {
  const { payload, original, adjustments, outboxes } = fixture(t);
  assert.deepEqual(await reconcileLegacyGoogleAdsOutcomes(), { recorded: 0, failed: 0 });
  assert.equal(adjustments.length, 0, "refund-free sales without correction history need no restatement");
  payload.finance.transactions = [100, 50].map((amount, index) => ({ id: `refund-${index}`, orderId: "refund-project", type: "expense", category: "refund", amount }));
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  assert.equal(adjustments[0].adjusted_value.toFixed(2), "850.00");
  const first = { ...adjustments[0] };
  payload.finance.transactions.pop();
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  assert.equal(adjustments[1].adjusted_value.toFixed(2), "900.00");
  const second = { ...adjustments[1] };
  payload.finance.transactions = [];
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  assert.equal(adjustments[2].adjusted_value.toFixed(2), "1000.00");
  assert.equal(adjustments[2].financial_reference_id, "legacy-project-refund-project-revision-3");
  assert.equal(adjustments[2].reason, "Customer refund removed in CRM");
  assert.ok(adjustments[2].occurred_at >= adjustments[1].occurred_at);
  assert.deepEqual(await reconcileLegacyGoogleAdsOutcomes(), { recorded: 0, failed: 0 });
  assert.deepEqual(await reconcileLegacyGoogleAdsOutcomes(), { recorded: 0, failed: 0 });
  assert.equal(adjustments.length, 3, "repeated sync does not append another restoration");
  assert.equal(outboxes.length, 3);
  assert.deepEqual(adjustments.slice(0, 2), [first, second]);
  assert.ok(adjustments.every(item => item.original_transaction_id === original.transaction_id && item.adjustment_type === "RESTATEMENT"));
  assert.ok(outboxes.every(item => item.original_transaction_id === original.transaction_id && item.processing_status === "queued"));
  assert.equal(original.conversion_value.toFixed(2), "1000.00");
});

test("zero refunds do not undo an unrelated manual restatement", async t => {
  const { adjustments, outboxes } = fixture(t);
  const manual = { conversion_event_id: "original-sale", financial_reference_id: "owner-correction", adjustment_type: "RESTATEMENT", adjusted_value: new Prisma.Decimal(700) };
  adjustments.push(manual);
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  assert.deepEqual(adjustments, [manual]);
  assert.equal(outboxes.length, 0);
});

test("cancellation still retracts once and removing refunds never revives a retracted conversion", async t => {
  const { order, payload, adjustments, outboxes } = fixture(t);
  order.status = "cancelled";
  payload.finance.transactions = [{ orderId: order.id, type: "expense", category: "refund", amount: 100 }];
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  assert.equal(adjustments[0].adjustment_type, "RETRACTION");
  assert.equal(adjustments[0].adjusted_value, null);
  const retraction = { ...adjustments[0] };
  order.status = "completed";
  payload.finance.transactions = [];
  assert.deepEqual(await reconcileLegacyGoogleAdsOutcomes(), { recorded: 0, failed: 0 });
  assert.deepEqual(adjustments, [retraction]);
  assert.equal(outboxes.length, 1);
});

test("a backdated owner retraction behind a later legacy restatement prevents refund-removal restoration", async t => {
  const { order, payload, original, adjustments, outboxes } = fixture(t);
  adjustments.push(
    { financial_reference_id: "owner-backdated-retraction", adjustment_type: "RETRACTION", adjusted_value: null, occurred_at: new Date("2026-10-01T12:00:00Z") },
    { financial_reference_id: "legacy-project-refund-project-revision-1", adjustment_type: "RESTATEMENT", adjusted_value: new Prisma.Decimal(850), occurred_at: new Date("2026-10-20T12:00:00Z") },
  );
  const saved = adjustments.map(item => ({ ...item }));
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  assert.deepEqual(await reconcileLegacyGoogleAdsOutcomes(), { recorded: 0, failed: 0 });
  payload.finance.transactions = [{ orderId: order.id, type: "expense", category: "refund", amount: 50 }];
  assert.equal((await reconcileLegacyGoogleAdsOutcomes()).failed, 0);
  assert.deepEqual(adjustments, saved, "neither zero nor partial refunds revive a terminal retraction");
  assert.equal(outboxes.length, 0);
  assert.equal(original.conversion_value.toFixed(2), "1000.00");
});
