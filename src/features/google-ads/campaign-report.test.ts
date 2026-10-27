import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { buildGoogleAdsCampaignReport, defaultGoogleAdsRange, googleAdsProjectMoney, type CampaignTouchpoint } from "./campaign-report";
import { legacyGoogleAdsSale } from "./legacy-outcomes";
import { captureGoogleAdsUrl } from "./browser-attribution";
import { selectGoogleAdsReportCustomer } from "./roas";

const cost = (customer_id = "123", currency = "USD") => ({ customer_id, campaign_id: "456", campaign_name: "Film", currency, cost_amount: new Prisma.Decimal(100), clicks: 10n, impressions: 100n });
const point: CampaignTouchpoint = { acquisition_touchpoint_id: "touch-1", lead_id: "lead-1", legacy_order_id: null, google_ads_customer_id: "123", google_ads_campaign_id: "456", captured_at: new Date("2026-10-05T12:00:00Z") };
const order = () => ({ id: "order-1", canonicalLeadId: "lead-1", number: "R-1", status: "completed", depositReceived: true, payments: [{ amount: 200 }, { amount: 800 }], measurements: { rooms: [{ windows: [{}] }] }, _inventoryDeducted: true, _inventoryMaterialCost: 100, productionStages: [{ id: "stage-1", status: "done", payroll: [{ userId: "installer", amount: 150 }] }], payouts: [{ userId: "installer", stageId: "stage-1", amount: 150, paid: true }], extraExpenses: [{ amount: 50, actual: true }] });

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

test("a fixed installer payment counts despite their zero-valued stage payroll snapshot", () => {
  const project = { ...order(), _inventoryMaterialCost: 0, extraExpenses: [], productionStages: [{ id: "fixed-stage", status: "done", payroll: [{ userId: "fixed-installer", amount: 0 }] }], payouts: [{ userId: "fixed-installer", stageId: null, type: "fixed_per_job", amount: 200, paid: true }] };
  assert.equal(googleAdsProjectMoney(project, {}).directCost.toFixed(2), "200.00");
  Object.assign(project, { googleAdsCostsReview: { fingerprint: googleAdsProjectMoney(project, {}).fingerprint } });
  const report = buildGoogleAdsCampaignReport([cost()], [point], { orders: [project] }, "2026-10-01", "2026-10-25", "123");
  assert.equal(report.campaigns[0].roi_percent, "700.00");
});

test("labor matches payments to worker and stage while retaining separate unstaged work", () => {
  const project = { ...order(), _inventoryMaterialCost: 0, extraExpenses: [], productionStages: [
    { id: "first", status: "done", payroll: [{ userId: "installer", amount: 150 }] },
    { id: "second", status: "done", payroll: [{ userId: "installer", amount: 100 }] },
  ], payouts: [
    { userId: "installer", stageId: "first", amount: 75, paid: true },
    { userId: "installer", stageId: "first", amount: 75, paid: true },
    { userId: "installer", stageId: "second", amount: 40, paid: true },
    { userId: "installer", stageId: null, amount: 60, paid: true },
  ] };
  assert.equal(googleAdsProjectMoney(project, {}).directCost.toFixed(2), "310.00", "count each stage's accrual once plus the unstaged payment");
  project.payouts.push({ userId: "installer", stageId: "second", amount: 80, paid: true });
  assert.equal(googleAdsProjectMoney(project, {}).directCost.toFixed(2), "330.00", "payments above an accrual still count as actual labor cost");
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

test("bank payments require explicit reconciliation and overhead is excluded", () => {
  const project = { ...order(), extraExpenses: [{ id: "contractor", type: "subcontractor", amount: 200, actual: true }] };
  const bank = { id: "bank", orderId: project.id, category: "subcontractor", type: "expense", amount: 200 };
  const workspace = { finance: { transactions: [bank, { orderId: project.id, category: "rent", type: "expense", amount: 900 }] } };
  assert.ok(googleAdsProjectMoney(project, workspace).issues.includes("expense_links_not_reviewed"));
  Object.assign(bank, { projectExpenseId: "contractor" });
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "450.00", "material 100 + labor 150 + contractor 200 once");
  assert.equal(googleAdsProjectMoney(project, workspace).unresolvedExpenseLinks.length, 0);
  Object.assign(bank, { projectExpenseId: null });
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "650.00", "an explicitly separate bank expense remains an additional cost");
});

test("cancelled jobs can finalize sunk costs without completing abandoned work", () => {
  const project = { ...order(), status: "cancelled", productionStages: [{ status: "scheduled", payroll: [] }], extraExpenses: [{ id: "unused", amount: 99, actual: false }], _inventoryDeducted: false };
  assert.deepEqual(googleAdsProjectMoney(project, {}).issues, []);
});

test("archiving a job preserves financial history and does not duplicate an active stale copy", () => {
  const project = order();
  const result = buildGoogleAdsCampaignReport([cost()], [point], { orders: [project], archivedOrders: [project] }, "2026-10-01", "2026-10-25", "123");
  assert.equal(result.campaigns[0].realized_revenue, "1000.00");
  assert.equal(result.campaigns[0].projects.length, 1);
});

test("cross-account conversion owners do not hide a leaf account's spend", () => {
  assert.equal(selectGoogleAdsReportCustomer(["123"], "999"), "123");
  assert.equal(selectGoogleAdsReportCustomer(["123", "456"], "999"), null);
  assert.equal(selectGoogleAdsReportCustomer(["1234567890"], null, "123-456-7890"), "1234567890");
  assert.throws(() => selectGoogleAdsReportCustomer(["123"], null, "invalid"));
});
