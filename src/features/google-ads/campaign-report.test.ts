import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
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

test("completed fixed job obligations count before payment and reconcile partial payouts", () => {
  const project: any = { ...order(), _inventoryMaterialCost: 0, extraExpenses: [], installationDoneAt: "2026-10-10", installerIds: ["fixed-installer"], productionStages: [{ id: "fixed-stage", status: "done", payroll: [{ userId: "fixed-installer", amount: 0 }] }], payouts: [] };
  const user = { id: "fixed-installer", role: "installer", active: false, payConfig: { type: "fixed_per_job", fixedPerJob: 200 } };
  const workspace = { orders: [project], users: [user] };
  const source = readFileSync("private/legacy/production-stages.js", "utf8");
  const context = vm.createContext({ db: workspace, getUser: () => user, projectStages: (value: any) => value.productionStages });
  vm.runInContext(source.slice(source.indexOf("function calcUserPayoutForPeriod("), source.indexOf("function markPayoutPaid(")), context);
  assert.equal(vm.runInContext("calcUserPayoutForPeriod('fixed-installer', new Date('2026-10-01'), new Date('2026-10-25')).total", context), 200);
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "200.00");
  project.payouts.push({ userId: user.id, stageId: null, type: "fixed_per_job", amount: 75, paid: true });
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "200.00");
  project.payouts.push({ userId: user.id, stageId: null, type: "fixed_per_job", amount: 125, paid: true });
  const paid = googleAdsProjectMoney(project, workspace);
  assert.equal(paid.directCost.toFixed(2), "200.00", "settlement replaces the accrual without doubling it");
  project.googleAdsCostsReview = { fingerprint: paid.fingerprint };
  user.payConfig.fixedPerJob = 250;
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "250.00");
  assert.equal(googleAdsProjectMoney(project, workspace).costsConfirmed, false);
});

test("a measurer's completed fixed job remains a cost on cancellation; unearned work does not", () => {
  const project: any = { ...order(), status: "cancelled", _inventoryMaterialCost: 0, extraExpenses: [], productionStages: [], payouts: [], measurerId: "measurer", measurementDoneAt: "2026-10-10", installerIds: ["installer"] };
  const workspace = { users: [
    { id: "measurer", role: "measurer", payConfig: { type: "fixed_per_job", fixedPerJob: 80 } },
    { id: "installer", role: "installer", payConfig: { type: "fixed_per_job", fixedPerJob: 200 } },
    { id: "unassigned", role: "installer", payConfig: { type: "fixed_per_job", fixedPerJob: 300 } },
  ] };
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "80.00");
  project.measurementDoneAt = null;
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "0.00");
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

test("dynamic payroll requires a separate settlement review and source changes reopen it", () => {
  const project: any = { ...order(), managerId: "manager", paidAt: "2026-10-10", installationDoneAt: "2026-10-10", installerIds: ["piece-worker"], productionStages: [], payouts: [], extraExpenses: [] };
  const workspace = { orders: [project], users: [
    { id: "manager", role: "manager", payConfig: { type: "commission", commissionPct: 10 } },
    { id: "piece-worker", role: "installer", payConfig: { type: "per_sqft", ratePerSqft: 2 } },
  ], settings: { complexityCoefs: { standard: 1 } } };
  let money = googleAdsProjectMoney(project, workspace);
  assert.deepEqual(money.payrollReviewUserIds, ["manager", "piece-worker"]);
  assert.ok(money.issues.includes("payroll_not_settled"));
  project.payouts.push({ userId: "manager", amount: 50, paid: true, stageId: null });
  assert.ok(googleAdsProjectMoney(project, workspace).issues.includes("payroll_not_settled"), "a partial payout cannot silently clear the gate");
  project.payouts.push({ userId: "manager", amount: 50, paid: true, stageId: null }, { userId: "piece-worker", amount: 100, paid: true, stageId: null });
  money = googleAdsProjectMoney(project, workspace);
  project.googleAdsPayrollReview = { basis: money.payrollReviewBasis };
  money = googleAdsProjectMoney(project, workspace);
  assert.deepEqual(money.issues, []);
  project.googleAdsCostsReview = { fingerprint: money.fingerprint };
  assert.equal(googleAdsProjectMoney(project, workspace).costsConfirmed, true);
  Object.assign(workspace.settings, { smsReadIds: ["read-message"], academyProgress: { user: 1 }, importMode: true });
  Object.assign(project, { notes: "A new internal note", siteInfo: { updatedAt: "2026-10-28" } });
  assert.equal(googleAdsProjectMoney(project, workspace).costsConfirmed, true, "communication and UI changes do not reopen payroll review");
  workspace.users[0].payConfig.commissionPct = 15;
  assert.ok(googleAdsProjectMoney(project, workspace).issues.includes("payroll_not_settled"));
  assert.equal(googleAdsProjectMoney(project, workspace).costsConfirmed, false);
  workspace.users[0].payConfig.commissionPct = 10;
  workspace.settings.complexityCoefs.standard = 2;
  assert.ok(googleAdsProjectMoney(project, workspace).issues.includes("payroll_not_settled"));
});

test("fully staged work needs no unstaged review; an uncovered quantity line does", () => {
  const project: any = { ...order(), serviceType: "solar_film", installationDoneAt: "2026-10-10", installerIds: ["installer"], productionStages: [{ ...order().productionStages[0], serviceId: "direction:solar_film" }] };
  const workspace = { users: [{ id: "installer", payConfig: { type: "per_sqft", ratePerSqft: 2 } }] };
  assert.deepEqual(googleAdsProjectMoney(project, workspace).payrollReviewUserIds, []);
  project.extraServices = [{ id: "controller", unit: "piece", qty: 1 }];
  assert.ok(googleAdsProjectMoney(project, workspace).issues.includes("payroll_not_settled"));
});

test("installer commission cannot be confirmed through the manager-only commission payroll path", () => {
  const project = { ...order(), installerIds: ["installer"], installationDoneAt: "2026-10-10" };
  const workspace = { users: [{ id: "installer", role: "installer", payConfig: { type: "commission", commissionPct: 10 } }] };
  assert.ok(googleAdsProjectMoney(project, workspace).issues.includes("unsupported_installer_commission"));
  Object.assign(project, { googleAdsCostsReview: { fingerprint: googleAdsProjectMoney(project, workspace).fingerprint } });
  assert.equal(googleAdsProjectMoney(project, workspace).costsConfirmed, false);
});

test("owner settlement control uses existing payroll and refuses unpaid or partial balances, including archives", async () => {
  const source = readFileSync("private/legacy/production-stages.js", "utf8");
  const project = { id: "order-1", payouts: [] as any[] };
  const calls: any[] = [], alerts: string[] = [];
  let earned = 100;
  const context = vm.createContext({
    db: { archivedOrders: [project] }, state: { googleAdsCrm: { report: { campaigns: [{ projects: [{ order_id: project.id, payroll_review_user_ids: ["manager"] }] }] } } },
    currentUser: () => ({ role: "owner" }), getOrder: () => null,
    calcUserPayoutForPeriod: (_user: string, _start: Date, _end: Date, orders: any[]) => { assert.equal(orders[0], project); return { breakdown: [{ orderId: project.id, amount: earned }] }; },
    confirm: () => true, alert: (message: string) => alerts.push(message),
    googleAdsConvRequest: async (...args: any[]) => calls.push(args), loadGoogleAdsCrm: () => {},
  });
  vm.runInContext(source.slice(source.indexOf("async function googleAdsConfirmProjectPayroll("), source.indexOf("async function googleAdsConfirmProjectCosts(")), context);
  await context.googleAdsConfirmProjectPayroll(project.id, "fingerprint");
  project.payouts.push({ userId: "manager", amount: 50, paid: true });
  await context.googleAdsConfirmProjectPayroll(project.id, "fingerprint");
  assert.equal(calls.length, 0);
  assert.equal(alerts.length, 2);
  project.payouts.push({ userId: "manager", amount: 50, paid: true });
  await context.googleAdsConfirmProjectPayroll(project.id, "fingerprint");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].confirmation, "PAYROLL_SETTLED");
  earned = 150;
  await context.googleAdsConfirmProjectPayroll(project.id, "fingerprint");
  assert.equal(calls.length, 1, "a later rate increase must be settled before review");
  assert.equal(project.payouts.length, 2, "review never creates a payment");
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

test("quantity-service materials count once and their source costs invalidate review", () => {
  const project: any = { ...order(), measurements: { rooms: [] }, _inventoryDeducted: false, _inventoryMaterialCost: 0, productionStages: [], payouts: [], extraExpenses: [], extraServices: [
    { id: "controllers", offeringId: "controller", unit: "piece", qty: 2, offeringMaterialCost: 75 },
    { id: "film", offeringId: "film", unit: "sqft", qty: 10, offeringMaterialCost: 999 },
    { id: "quick", offeringId: "film", quickProjectLine: true, unit: "piece", qty: 10, offeringMaterialCost: 999 },
  ] };
  const workspace = { orders: [project], settings: { serviceOfferings: [{ id: "controller", materialCostPerUnit: 80 }] } };
  let money = googleAdsProjectMoney(project, workspace);
  assert.equal(money.directCost.toFixed(2), "150.00");
  assert.deepEqual(money.issues, []);
  project.googleAdsCostsReview = { fingerprint: money.fingerprint };
  assert.equal(buildGoogleAdsCampaignReport([cost()], [point], workspace, "2026-10-01", "2026-10-25", "123").campaigns[0].roi_percent, "750.00");
  project.extraServices[0].offeringMaterialCost = 80;
  assert.equal(googleAdsProjectMoney(project, workspace).costsConfirmed, false);
  delete project.extraServices[0].offeringMaterialCost;
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "160.00", "the existing service-directory fallback remains available");
  workspace.settings.serviceOfferings = [];
  assert.ok(googleAdsProjectMoney(project, workspace).issues.includes("material_cost_not_verified"));
  project.extraServices[0].offeringMaterialCost = -1;
  assert.ok(googleAdsProjectMoney(project, workspace).issues.includes("material_cost_not_verified"));
  project.extraServices[0].offeringMaterialCost = "not-a-cost";
  assert.ok(googleAdsProjectMoney(project, workspace).issues.includes("material_cost_not_verified"));
  project.extraServices[0].offeringMaterialCost = 0;
  assert.deepEqual(googleAdsProjectMoney(project, workspace).issues, [], "an explicit zero is different from a missing unit cost");
});

test("unused directions exclude quoted components and film requirements but retain sunk costs", () => {
  const project: any = { ...order(), _inventoryDeducted: false, _inventoryMaterialCost: 0, productionStages: [], payouts: [{ userId: "worker", amount: 50, paid: true }], extraExpenses: [{ amount: 30, actual: true }], excludedProjectDirections: ["smart_film", "decorative_film", "general_works"],
    measurements: { rooms: [{ windows: [{ measureScope: "privacy_film" }] }] },
    extraServices: [
      { id: "controllers", offeringId: "controller", serviceType: "solar_film", unit: "piece", qty: 2, offeringMaterialCost: 75 },
      { id: "general", offeringId: "general", serviceType: "general_works", unit: "piece", qty: 1, offeringMaterialCost: 90 },
      { id: "included", offeringId: "solar", serviceType: "solar_film", unit: "piece", qty: 1, offeringMaterialCost: 20 },
    ] };
  const workspace = { settings: { serviceOfferings: [{ id: "controller", direction: "smart" }] }, finance: { transactions: [{ orderId: project.id, type: "expense", category: "inventory_purchase", inventoryCostTreatment: "separate", projectExpenseId: null, amount: 100 }] } };
  const money = googleAdsProjectMoney(project, workspace);
  assert.equal(money.directCost.toFixed(2), "200.00", "only included components 20 plus recorded labor 50, actual expense 30 and purchase 100");
  assert.deepEqual(money.issues, [], "unused film needs no fictitious warehouse issue");
  project.googleAdsCostsReview = { fingerprint: money.fingerprint };
  project.excludedProjectDirections = ["decorative_film", "general_works"];
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "350.00");
  assert.equal(googleAdsProjectMoney(project, workspace).costsConfirmed, false);
});

test("quantity-service purchase payments require review and share the recorded material allowance", () => {
  const project = { ...order(), measurements: { rooms: [] }, _inventoryDeducted: false, _inventoryMaterialCost: 0, productionStages: [], payouts: [], extraExpenses: [], extraServices: [{ id: "controllers", offeringId: "controller", unit: "piece", qty: 2, offeringMaterialCost: 75 }] };
  const purchase: any = { id: "purchase", orderId: project.id, category: "inventory_purchase", type: "expense", amount: 200, projectExpenseId: null };
  const workspace = { finance: { transactions: [purchase] } };
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "350.00");
  assert.equal(googleAdsProjectMoney(project, workspace).unresolvedExpenseLinks.length, 1);
  Object.assign(purchase, { inventoryCostTreatment: "service_material" });
  const reviewed = googleAdsProjectMoney(project, workspace);
  assert.equal(reviewed.directCost.toFixed(2), "200.00", "retain the payment excess without counting the same components twice");
  assert.deepEqual(reviewed.issues, []);
  const mixed = { ...project, _inventoryDeducted: true, _inventoryMaterialCost: 100, _inventoryLog: [{ rollId: "roll-1", materialCost: 100 }] };
  workspace.finance.transactions.push({ id: "roll-purchase", orderId: project.id, category: "inventory_purchase", type: "expense", amount: 1000, inventoryId: "roll-1" });
  assert.equal(googleAdsProjectMoney(mixed, workspace).directCost.toFixed(2), "300.00", "component payments cannot consume an unrelated film allowance");
  purchase.inventoryId = "roll-1";
  mixed.extraServices[0].offeringMaterialCost = 0;
  assert.equal(googleAdsProjectMoney(mixed, workspace).directCost.toFixed(2), "300.00", "an explicit component choice never turns into a roll receipt when its coverage disappears");
});

test("project-specific variable vehicle and rental expenses stay in direct-cost reconciliation", () => {
  const project = order();
  const vehicle: any = { id: "vehicle", orderId: project.id, type: "expense", category: "vehicle", costBehavior: "variable", amount: 100 };
  const rental: any = { id: "rent", orderId: project.id, type: "expense", category: "rent", costBehavior: "variable", amount: 200 };
  const workspace = { finance: { transactions: [vehicle, rental,
    { ...vehicle, id: "fixed", costBehavior: "fixed", amount: 999 },
    { ...rental, id: "overhead", costBehavior: undefined, amount: 999 },
    { ...vehicle, id: "personal", scope: "personal", amount: 999 },
    { ...vehicle, id: "other-job", orderId: "other", amount: 999 },
  ] } };
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "600.00");
  assert.equal(googleAdsProjectMoney(project, workspace).unresolvedExpenseLinks.length, 2);
  vehicle.projectExpenseId = null; rental.projectExpenseId = null;
  const reviewed = googleAdsProjectMoney(project, workspace);
  assert.deepEqual(reviewed.issues, []);
  Object.assign(project, { googleAdsCostsReview: { fingerprint: reviewed.fingerprint } });
  vehicle.amount = 110;
  assert.equal(googleAdsProjectMoney(project, workspace).costsConfirmed, false);
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

test("inventory payments need review beside warehouse film costs and retain separate equipment", () => {
  const project = order();
  const equipment = { id: "equipment", orderId: project.id, category: "inventory_purchase", type: "expense", amount: 50, projectExpenseId: null };
  const film = { id: "film", orderId: project.id, category: "inventory_purchase", type: "expense", amount: 100, projectExpenseId: null };
  const workspace = { finance: { transactions: [equipment, film] } };
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "450.00", "unreviewed purchases remain visible instead of being dropped");
  assert.equal(googleAdsProjectMoney(project, workspace).unresolvedExpenseLinks.length, 2);
  Object.assign(equipment, { inventoryCostTreatment: "separate" });
  Object.assign(film, { inventoryCostTreatment: "warehouse" });
  const reviewed = googleAdsProjectMoney(project, workspace);
  assert.equal(reviewed.directCost.toFixed(2), "350.00", "warehouse film is counted once and separate equipment remains");
  assert.deepEqual(reviewed.issues, []);
  Object.assign(project, { googleAdsCostsReview: { fingerprint: reviewed.fingerprint } });
  assert.equal(googleAdsProjectMoney(project, workspace).costsConfirmed, true);
  film.amount = 90;
  const edited = googleAdsProjectMoney(project, workspace);
  assert.equal(edited.directCost.toFixed(2), "350.00");
  assert.equal(edited.costsConfirmed, false, "editing a covered payment invalidates review even when the total is unchanged");
});

test("warehouse payment installments share one material allowance and retain payment excess", () => {
  const project = { ...order(), extraExpenses: [] };
  const warehouse = { orderId: project.id, category: "inventory_purchase", type: "expense", projectExpenseId: null, inventoryCostTreatment: "warehouse" };
  const workspace = { finance: { transactions: [{ ...warehouse, id: "part-1", amount: 60 }, { ...warehouse, id: "part-2", amount: 70 }] } };
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "280.00", "material 100 plus payment excess 30 plus labor 150");
});

test("a proven roll receipt uses only consumed film cost while separate equipment remains a project cost", () => {
  const project = { ...order(), productionStages: [], payouts: [], extraExpenses: [{ id: "transport", amount: 30, actual: true }], _inventoryLog: [{ rollId: "roll-1", materialCost: 100 }] };
  const workspace = { finance: { transactions: [
    { id: "roll-purchase", orderId: project.id, category: "inventory_purchase", type: "expense", inventoryId: "roll-1", amount: 1000 },
    { id: "equipment", orderId: project.id, category: "inventory_purchase", type: "expense", inventoryCostTreatment: "separate", amount: 75, projectExpenseId: null },
  ] } };
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "205.00", "count consumed film 100, equipment 75 and transport 30; exclude unconsumed stock");
  assert.deepEqual(googleAdsProjectMoney(project, workspace).issues, []);
  Object.assign(workspace.finance.transactions[0], { inventoryCostTreatment: "separate", projectExpenseId: null });
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "1205.00", "an explicit separate-cost review overrides stock matching");
  Object.assign(workspace.finance.transactions[0], { inventoryCostTreatment: "expense", projectExpenseId: "transport" });
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "1175.00", "an explicit actual expense link overrides stock matching and counts that expense once");
  Object.assign(workspace.finance.transactions[0], { inventoryId: "unrelated-roll", inventoryCostTreatment: undefined, projectExpenseId: null });
  assert.ok(googleAdsProjectMoney(project, workspace).issues.includes("expense_links_not_reviewed"));
});

test("inventory purchases without warehouse issue and linked actual expenses remain counted once", () => {
  const project = { ...order(), measurements: { rooms: [] }, _inventoryDeducted: false, _inventoryMaterialCost: 0, extraExpenses: [{ id: "equipment", amount: 200, actual: true }] };
  const purchase = { id: "purchase", orderId: project.id, category: "inventory_purchase", type: "expense", costBehavior: "fixed", amount: 200, projectExpenseId: "equipment" };
  const workspace = { finance: { transactions: [purchase] } };
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "350.00", "actual equipment expense and its purchase payment are one cost");
  assert.deepEqual(googleAdsProjectMoney(project, workspace).issues, []);
  Object.assign(purchase, { projectExpenseId: null });
  assert.equal(googleAdsProjectMoney(project, workspace).directCost.toFixed(2), "550.00", "ordinary separate purchases remain costs without a warehouse issue");
});

test("the existing expense picker offers warehouse review and sends distinct owner choices", async () => {
  const source = readFileSync("private/legacy/production-stages.js", "utf8");
  const requests: any[] = [];
  const context = vm.createContext({ academyEsc: String, jsQuote: String, financeCategoryLabel: String, currentUser: () => ({ role: "owner" }), googleAdsConvRequest: async (_url: string, _method: string, body: unknown) => { requests.push(body); }, loadGoogleAdsCrm: () => {}, alert: (message: string) => { throw new Error(message); } });
  for (const name of ["googleAdsReportMoney", "googleAdsCampaignReportHtml", "googleAdsLinkExpense"]) {
    const start = source.indexOf(`function ${name}(`);
    vm.runInContext(source.slice(source.lastIndexOf("\n", start) + 1, source.indexOf("\n}", start) + 2), context);
  }
  const payment = { transaction_id: "purchase", amount: "100", category: "inventory_purchase", warehouse_available: true, service_material_available: false };
  const report = { campaigns: [{ currency: "USD", projects: [{ order_id: "order-1", expense_links: [payment] }] }] };
  assert.match(context.googleAdsCampaignReportHtml(report), /value="warehouse"/);
  payment.warehouse_available = false;
  assert.doesNotMatch(context.googleAdsCampaignReportHtml(report), /value="warehouse"/);
  payment.service_material_available = true;
  assert.match(context.googleAdsCampaignReportHtml(report), /value="service_material"/);
  for (const choice of ["warehouse", "service_material", "separate", "equipment-expense"]) await context.googleAdsLinkExpense("order-1", "purchase", choice);
  const base = { operation: "link_expense", order_id: "order-1", transaction_id: "purchase" };
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{ ...base, expense_id: null, inventory_cost_treatment: "warehouse" }, { ...base, expense_id: null, inventory_cost_treatment: "service_material" }, { ...base, expense_id: null }, { ...base, expense_id: "equipment-expense" }]);
});

test("cancelled jobs can finalize sunk costs without completing abandoned work", () => {
  const project = { ...order(), status: "cancelled", productionStages: [{ status: "scheduled", payroll: [] }], extraExpenses: [{ id: "unused", amount: 99, actual: false }], _inventoryDeducted: false, _inventoryMaterialCost: 0,
    extraServices: [{ offeringId: "quoted", unit: "piece", qty: 2, offeringMaterialCost: 75 }, { offeringId: "unpriced", unit: "piece", qty: 1 }],
  };
  for (const status of ["cancelled", "canceled", "lost"]) {
    project.status = status;
    const money = googleAdsProjectMoney(project, {});
    assert.deepEqual(money.issues, []);
    assert.equal(money.directCost.toFixed(2), "150.00", "keep paid labor but exclude unconsumed quoted components");
  }
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
