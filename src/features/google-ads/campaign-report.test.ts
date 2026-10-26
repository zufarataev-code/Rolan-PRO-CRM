import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { buildGoogleAdsCampaignReport, defaultGoogleAdsRange, googleAdsProjectMoney, type CampaignTouchpoint } from "./campaign-report";
import { legacyGoogleAdsSale } from "./legacy-outcomes";
import { captureGoogleAdsUrl } from "./browser-attribution";

const cost = (customer_id = "123", currency = "USD") => ({ customer_id, campaign_id: "456", campaign_name: "Film", currency, cost_amount: new Prisma.Decimal(100), clicks: 10n, impressions: 100n });
const point: CampaignTouchpoint = { acquisition_touchpoint_id: "touch-1", lead_id: "lead-1", legacy_order_id: null, google_ads_customer_id: "123", google_ads_campaign_id: "456", captured_at: new Date("2026-10-05T12:00:00Z") };
const order = () => ({ id: "order-1", canonicalLeadId: "lead-1", number: "R-1", status: "completed", depositReceived: true, payments: [{ amount: 200 }, { amount: 800 }], measurements: { rooms: [{ windows: [{}] }] }, _inventoryDeducted: true, _inventoryMaterialCost: 100, productionStages: [{ status: "done", payroll: [{ userId: "installer", amount: 150 }] }], payouts: [{ userId: "installer", amount: 150 }], extraExpenses: [{ amount: 50, actual: true }] });

test("campaign ROI uses net receipts and existing costs exactly once, and requires an owner cost review", () => {
  const project = order();
  const workspace = { orders: [project], finance: { transactions: [{ orderId: "order-1", type: "income", amount: 1000 }, { orderId: "order-1", type: "expense", category: "refund", amount: 100 }, { orderId: "order-1", type: "expense", category: "payroll", amount: 150 }] } };
  const report = () => buildGoogleAdsCampaignReport([cost(), cost("other")], [point], workspace, "2026-10-01", "2026-10-25", "123");
  assert.equal(report().campaigns.length, 1);
  assert.equal(report().campaigns[0].realized_revenue, "900.00");
  assert.equal(report().campaigns[0].direct_cost, "300.00");
  assert.equal(report().campaigns[0].roas, "9.0000");
  assert.equal(report().campaigns[0].roi_percent, null);
  Object.assign(project, { googleAdsCostsReview: { fingerprint: googleAdsProjectMoney(project, workspace).fingerprint } });
  assert.equal(report().campaigns[0].roi_percent, "500.00");
  project._inventoryMaterialCost = 120;
  assert.equal(report().campaigns[0].roi_percent, null, "a later cost change invalidates the owner's review");
});

test("a deposit is cash received but not completed-job revenue or profit", () => {
  const project = { ...order(), status: "proposal_accepted" };
  const result = buildGoogleAdsCampaignReport([cost()], [point], { orders: [project] }, "2026-10-01", "2026-10-25", "123").campaigns[0];
  assert.equal(result.received, "1000.00");
  assert.equal(result.realized_revenue, "0.00");
  assert.equal(result.roi_percent, null);
});

test("campaigns stay separated by currency and account; a free-text source never assigns revenue", () => {
  const report = buildGoogleAdsCampaignReport([cost(), cost("123", "CAD"), cost("other")], [point], { orders: [order(), { id: "unknown", leadSource: "google", paid: 10000 }] }, "2026-10-01", "2026-10-25", "123");
  assert.equal(report.campaigns.length, 2);
  assert.equal(report.unattributed_projects, 1);
  assert.equal(report.campaigns.find(row => row.currency === "CAD")?.realized_revenue, "0.00");
});

test("the first campaign acquisition defines the cohort and repeated touchpoints do not duplicate a lead", () => {
  const older = { ...point, captured_at: new Date("2026-09-20T12:00:00Z") };
  const report = buildGoogleAdsCampaignReport([cost()], [point, older], { orders: [order()] }, "2026-10-01", "2026-10-25", "123");
  assert.equal(report.campaigns[0].leads, 0);
  assert.equal(report.campaigns[0].realized_revenue, "0.00");
});

test("the default report matches LAST_30_DAYS in Pacific, including DST boundaries", () => {
  assert.deepEqual(defaultGoogleAdsRange(new Date("2026-10-26T20:00:00Z")), { startDate: "2026-09-26", endDate: "2026-10-25" });
  assert.deepEqual(defaultGoogleAdsRange(new Date("2026-11-02T07:30:00Z"), 1), { startDate: "2026-10-31", endDate: "2026-10-31" });
});

test("unfinished work and missing material costs remain unknown", () => {
  const project = order();
  project._inventoryDeducted = false;
  assert.ok(googleAdsProjectMoney(project, {}).issues.includes("material_cost_not_verified"));
  project.extraExpenses[0].actual = false;
  assert.ok(googleAdsProjectMoney(project, {}).issues.includes("expenses_not_actual"));
});

test("a manual sale requires the saved acceptance fact, deposit and approved value", () => {
  const project = { ...order(), projectEstimateSnapshot: { revenue: 2500 }, timeline: [{ key: "accepted_by_payment", at: "2026-10-20T10:00:00Z" }] };
  assert.equal(legacyGoogleAdsSale(project)?.conversionValue.toString(), "2500");
  assert.equal(legacyGoogleAdsSale({ ...project, depositReceived: false }), null);
  assert.equal(legacyGoogleAdsSale({ ...project, timeline: [] }), null);
  assert.equal(legacyGoogleAdsSale({ ...project, projectEstimateSnapshot: {} }), null);
});

test("landing capture preserves click/campaign IDs without inventing consent", () => {
  const captured = captureGoogleAdsUrl("https://rolan-pro.com/?google_ads_customer_id=123&campaign_id=456&gclid=click&gbraid=braid&utm_campaign=Smart", new Date("2026-10-20T10:00:00Z"));
  assert.equal(captured.google_ads_campaign_id, "456");
  assert.equal(captured.gclid, "click");
  assert.equal(captured.gbraid, "braid");
  assert.equal("consent" in captured, false);
});
