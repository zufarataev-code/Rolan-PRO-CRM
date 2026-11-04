import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClosedWonTransactionId,
  buildQualifiedLeadTransactionId,
  ensureQualifiedLeadConversion,
  ensureClosedWonConversion,
} from "./conversion-events";

test("qualified conversion keeps a stable deal transaction id", () => {
  assert.equal(buildQualifiedLeadTransactionId("deal-1"), "crm-deal-deal-1-qualified");
});
test("a booked lead can become a qualified conversion before a deal exists", () => {
  assert.equal(
    buildQualifiedLeadTransactionId({ leadId: "lead-1" }),
    "crm-lead-lead-1-qualified",
  );
});

test("closed-won conversion keeps a separate stable sale transaction id", () => {
  assert.equal(buildClosedWonTransactionId("deal-1"), "crm-deal-deal-1-sale");
});

test("every synchronous outcome producer derives PHONE from acquisition before its immutable upsert", async () => {
  const events = new Map<string, any>();
  const tx: any = {
    googleAdsIntegrationSetting: { findUnique: async () => ({ qualification_rules: { pipeline_status_code: "PROPOSAL_SENT" } }) },
    acquisitionTouchpoint: { findUnique: async () => ({ acquisition_touchpoint_id: "phone", session_attributes: { source_channel: "PHONE" } }) },
    deal: { findUnique: async () => null },
    conversionEvent: {
      findFirst: async () => null,
      upsert: async ({ where, create, update }: any) => {
        assert.deepEqual(update, {});
        if (!events.has(where.transaction_id)) events.set(where.transaction_id, create);
        return events.get(where.transaction_id);
      },
    },
  };
  await ensureQualifiedLeadConversion(tx, { dealId: "deal", attributionTouchpointId: "phone", pipelineStatusCode: "PROPOSAL_SENT", occurredAt: new Date(), eventSource: "OTHER" });
  await ensureClosedWonConversion(tx, { dealId: "deal", attributionTouchpointId: "phone", occurredAt: new Date(), conversionValue: null, currency: "USD", eventSource: "OTHER" });
  assert.equal(events.size, 2);
  assert.ok([...events.values()].every(event => event.event_source === "PHONE"));
});
