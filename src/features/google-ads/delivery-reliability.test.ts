import assert from "node:assert/strict";
import test from "node:test";
import { effectiveGoogleAdsValidateOnly, googleAdsEnvironmentAllowsLive } from "./delivery-mode";
import { prisma } from "@/lib/db";
import { getGoogleAccessToken, clearGoogleAccessTokenCache } from "./oauth";
import { reconcileNextConversionRequestStatus } from "./request-status";
import { findAcquisitionTouchpoint } from "./attribution";
import { buildQualifiedLeadTransactionId } from "./conversion-events";

test("live mode requires both explicit switches; unset and malformed environment values stay safe", () => {
  for (const value of ["", "true", "FALSE_typo"]) {
    assert.equal(googleAdsEnvironmentAllowsLive(value), false);
    assert.equal(effectiveGoogleAdsValidateOnly(false, value), true);
  }
  assert.equal(effectiveGoogleAdsValidateOnly(false, "false"), false);
  assert.equal(effectiveGoogleAdsValidateOnly(true, "false"), true);
  assert.equal(effectiveGoogleAdsValidateOnly(undefined, "false"), true);
});

test("OAuth cache is isolated by scope and reuses the same scope", async t => {
  const previous = Object.fromEntries(["GOOGLE_ADS_OAUTH_CLIENT_ID", "GOOGLE_ADS_OAUTH_CLIENT_SECRET", "GOOGLE_ADS_OAUTH_REFRESH_TOKEN"].map(key => [key, process.env[key]]));
  for (const key of Object.keys(previous)) process.env[key] = "offline-test";
  t.after(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; clearGoogleAccessTokenCache(); });
  clearGoogleAccessTokenCache();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ access_token: `scope-token-${++calls}`, expires_in: 3600 }), { status: 200 }));
  assert.equal(await getGoogleAccessToken(["datamanager"]), "scope-token-1");
  assert.equal(await getGoogleAccessToken(["adwords"]), "scope-token-2");
  assert.equal(await getGoogleAccessToken(["datamanager"]), "scope-token-1");
  assert.equal(calls, 2);
});

test("a failed status check backs off the submitted request and checks the next due row", async t => {
  let due = true;
  const replace = (model: any, method: string, implementation: any) => {
    const original = model[method];
    model[method] = implementation;
    t.after(() => { model[method] = original; });
  };
  replace(prisma.conversionUploadOutbox, "findFirst", async () => due ? { conversion_upload_outbox_id: "row-1", request_id: "request-1" } : null);
  replace(prisma.conversionUploadOutbox, "updateMany", async () => { due = false; return { count: 1 }; });
  const writes: any[] = [];
  replace(prisma.conversionUploadOutbox, "update", async (args: any) => { writes.push(args.data); return {}; });
  replace(prisma.googleAdsIntegrationSetting, "findUnique", async () => ({ cloud_project_id: null }));
  const previous = Object.fromEntries(["GOOGLE_ADS_OAUTH_CLIENT_ID", "GOOGLE_ADS_OAUTH_CLIENT_SECRET", "GOOGLE_ADS_OAUTH_REFRESH_TOKEN"].map(key => [key, process.env[key]]));
  for (const key of Object.keys(previous)) process.env[key] = "offline-test";
  t.after(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; clearGoogleAccessTokenCache(); });
  clearGoogleAccessTokenCache();
  t.mock.method(globalThis, "fetch", async (url: string | URL) => String(url).includes("oauth2") ? new Response(JSON.stringify({ access_token: "offline", expires_in: 3600 })) : new Response("{}", { status: 429 }));
  assert.equal((await reconcileNextConversionRequestStatus()).status, "retry");
  assert.equal((await reconcileNextConversionRequestStatus()).status, "idle");
  assert.equal(writes[0].processing_status, "submitted");
  assert.equal(writes[0].last_error.http_status, 429);
  assert.ok(writes[0].next_retry_at > new Date());
});

test("a usable Google touchpoint is preferred over a later direct visit", async () => {
  let calls = 0;
  const db = { acquisitionTouchpoint: { findFirst: async (args: any) => { calls++; assert.ok(args.where.AND); return { acquisition_touchpoint_id: "paid-original" }; } } };
  assert.equal((await findAcquisitionTouchpoint(db as any, { lead_id: "lead-1" }))?.acquisition_touchpoint_id, "paid-original");
  assert.equal(calls, 1);
  assert.equal(buildQualifiedLeadTransactionId({ dealId: "deal-1", leadId: "lead-1" }), buildQualifiedLeadTransactionId({ leadId: "lead-1" }));
});
