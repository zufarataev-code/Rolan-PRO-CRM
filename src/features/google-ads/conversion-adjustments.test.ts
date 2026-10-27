import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { createSessionToken, sessionCredentialFingerprint } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { POST as processAdjustments } from "../../../app/api/v1/integrations/google-ads/adjustments/process/route";

import {
  ConversionAdjustmentValidationError,
  createConversionAdjustment,
  normalizeAdjustmentCurrency,
  normalizeConversionAdjustmentDraft,
  reconcileConversionAdjustmentOutbox,
} from "./conversion-adjustments";

function expectValidationError(fn: () => unknown, code: string) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ConversionAdjustmentValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("RETRACTION rejects adjusted_value", () => {
  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "refund-1",
        adjustmentType: "RETRACTION",
        adjustedValue: "0",
      }),
    "retraction_value_forbidden",
  );
});

test("RESTATEMENT requires a non-negative final adjusted value", () => {
  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "refund-2",
        adjustmentType: "RESTATEMENT",
      }),
    "restatement_value_required",
  );

  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "refund-2",
        adjustmentType: "RESTATEMENT",
        adjustedValue: "-0.01",
      }),
    "invalid_adjusted_value",
  );
});

test("RESTATEMENT keeps the supplied value as the new final value without delta math", () => {
  const normalized = normalizeConversionAdjustmentDraft({
    financialReferenceId: "refund-3",
    adjustmentType: "RESTATEMENT",
    adjustedValue: "1250.50",
    currency: "usd",
  });

  assert.equal(normalized.adjustedValue?.toFixed(2), "1250.50");
  assert.equal(normalized.currency, "USD");
});

test("only RETRACTION and RESTATEMENT are accepted", () => {
  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "refund-4",
        adjustmentType: "ENHANCEMENT",
      }),
    "invalid_adjustment_type",
  );
});

test("currency normalization requires exactly three letters", () => {
  assert.equal(normalizeAdjustmentCurrency(" usd "), "USD");
  assert.equal(normalizeAdjustmentCurrency(undefined), null);
  expectValidationError(() => normalizeAdjustmentCurrency("US"), "invalid_currency");
  expectValidationError(() => normalizeAdjustmentCurrency("U1D"), "invalid_currency");
});

test("financial reference is mandatory and bounded", () => {
  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "   ",
        adjustmentType: "RETRACTION",
      }),
    "financial_reference_required",
  );

  expectValidationError(
    () =>
      normalizeConversionAdjustmentDraft({
        financialReferenceId: "x".repeat(192),
        adjustmentType: "RETRACTION",
      }),
    "financial_reference_too_long",
  );
});

test("saved refunds and cancellations receive one outbox after configuration without rewriting the correction", async t => {
  const replace = (model: any, method: string, implementation: any) => {
    const original = model[method];
    model[method] = implementation;
    t.after(() => { model[method] = original; });
  };
  let settings: { conversion_owner_customer_id: string; converted_lead_action_id: string; upload_enabled: boolean } | null = null;
  const events = ["refund", "cancel"].map(id => ({ conversion_event_id: id, event_type: "converted_lead", transaction_id: `sale-${id}`, currency: "USD", conversion_value: new Prisma.Decimal(1000) }));
  const adjustments: any[] = [], outboxes: any[] = [];
  replace(prisma, "$transaction", async (callback: any) => callback(prisma));
  replace(prisma, "$executeRaw", async () => 1);
  replace(prisma.googleAdsIntegrationSetting, "findUnique", async () => settings);
  replace(prisma.conversionEvent, "findUnique", async ({ where }: any) => events.find(event => event.conversion_event_id === where.conversion_event_id));
  replace(prisma.conversionAdjustment, "findUnique", async ({ where }: any) => {
    const key = where.conversion_event_id_financial_reference_id_adjustment_type;
    return adjustments.find(item => Object.entries(key).every(([field, value]) => item[field] === value)) ?? null;
  });
  replace(prisma.conversionAdjustment, "create", async ({ data }: any) => {
    const adjustment = { ...data, conversion_adjustment_id: `adjustment-${adjustments.length + 1}` };
    adjustments.push(adjustment);
    return adjustment;
  });
  let scans = 0, staleCandidate = false;
  replace(prisma.conversionAdjustment, "findMany", async ({ where, take }: any) => {
    scans += 1;
    assert.deepEqual(where, { upload_outboxes: { none: {} } });
    assert.ok(take >= 1 && take <= 100);
    return adjustments.filter(item => staleCandidate || !outboxes.some(row => row.conversion_adjustment_id === item.conversion_adjustment_id)).slice(0, take);
  });
  replace(prisma.conversionAdjustmentOutbox, "findFirst", async ({ where }: any) => outboxes.find(item => item.conversion_adjustment_id === where.conversion_adjustment_id) ?? null);
  replace(prisma.conversionAdjustmentOutbox, "upsert", async ({ where, create, update }: any) => {
    assert.deepEqual(update, {}, "reconciliation must not reset an existing delivery");
    const key = where.destination_account_id_action_id_original_transaction_id_conversion_adjustment_id;
    const existing = outboxes.find(item => Object.entries(key).every(([field, value]) => item[field] === value));
    if (existing) return existing;
    const outbox = { ...create, conversion_adjustment_outbox_id: `outbox-${outboxes.length + 1}` };
    outboxes.push(outbox);
    return outbox;
  });
  replace(prisma.conversionAdjustmentOutbox, "findMany", async () => { assert.fail("a paused worker must not claim an outbox row"); });
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("This test must stay offline."); });
  const drafts = [
    { conversionEventId: "refund", financialReferenceId: "api-refund-before-setup", adjustmentType: "RESTATEMENT", adjustedValue: "900", currency: "USD", occurredAt: new Date("2026-10-01T12:00:00Z") },
    { conversionEventId: "cancel", financialReferenceId: "legacy-project-cancel-revision-1", adjustmentType: "RETRACTION", occurredAt: new Date("2026-10-02T12:00:00Z") },
  ];
  for (const draft of drafts) assert.equal((await createConversionAdjustment(prisma, draft)).deliveryState, "awaiting_configuration");
  const saved = adjustments.map(item => ({ ...item }));
  assert.deepEqual(await reconcileConversionAdjustmentOutbox(1), { status: "awaiting_configuration", scanned: 0, created: 0 });
  assert.equal(outboxes.length, 0);

  settings = { conversion_owner_customer_id: "1234567890", converted_lead_action_id: "9988", upload_enabled: false };
  assert.deepEqual(await reconcileConversionAdjustmentOutbox(1), { status: "more_available", scanned: 1, created: 1 });
  assert.equal(outboxes.length, 1, "reconciliation respects its batch limit");
  const owner = { user_id: "offline-owner", email: "owner@example.test", password_hash: "offline-password", is_active: true, user_accesses: [{ role: { code: "OWNER" } }] };
  replace(prisma.user, "findUnique", async () => owner);
  const token = createSessionToken({ sub: owner.user_id, email: owner.email, pwd: sessionCredentialFingerprint(owner.password_hash), roles: ["OWNER"] });
  const previousUploadFlag = process.env.GOOGLE_ADS_UPLOAD_ENABLED;
  process.env.GOOGLE_ADS_UPLOAD_ENABLED = "true";
  t.after(() => { previousUploadFlag === undefined ? delete process.env.GOOGLE_ADS_UPLOAD_ENABLED : process.env.GOOGLE_ADS_UPLOAD_ENABLED = previousUploadFlag; });
  const beforeProcess = scans;
  const response = await processAdjustments(new NextRequest("http://localhost/api/v1/integrations/google-ads/adjustments/process", { method: "POST", headers: { cookie: `${getEnv().sessionCookieName}=${token}`, "content-type": "application/json" }, body: JSON.stringify({ limit: 25 }) }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.results, [{ status: "disabled" }]);
  assert.equal(scans - beforeProcess, 1, "external processing reconciles once before its worker loop");
  assert.equal(outboxes.length, 2, "external processing recovers a saved cancellation even while delivery is paused");
  for (const draft of drafts) assert.equal((await createConversionAdjustment(prisma, draft)).deliveryState, "queued");
  assert.deepEqual(await reconcileConversionAdjustmentOutbox(), { status: "complete", scanned: 0, created: 0 });
  assert.equal(outboxes.length, 2, "replays create no duplicate corrections or deliveries");
  assert.deepEqual(adjustments, saved);
  assert.deepEqual(outboxes.map(item => [item.destination_account_id, item.action_id, item.original_transaction_id]), [["1234567890", "9988", "sale-refund"], ["1234567890", "9988", "sale-cancel"]]);

  settings = { conversion_owner_customer_id: "2222222222", converted_lead_action_id: "8877", upload_enabled: false };
  await reconcileConversionAdjustmentOutbox();
  assert.equal(outboxes.length, 2, "existing correction deliveries are never retargeted");
  staleCandidate = true;
  await reconcileConversionAdjustmentOutbox();
  for (const draft of drafts) await createConversionAdjustment(prisma, draft);
  assert.equal(outboxes.length, 2, "stale reconciliation candidates and API retries reuse the original destination");
  assert.ok(events.every(event => event.conversion_value.eq(1000)), "original conversion values stay immutable");
  assert.equal(network.mock.callCount(), 0);
});
