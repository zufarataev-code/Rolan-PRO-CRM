import { legacyProjectsIncludingArchive } from "@/features/legacy-crm/project-archive";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GoogleAdsRoasError, validateRoasRange, selectGoogleAdsReportCustomer } from "./roas";

type Row = Record<string, any>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(item => item && typeof item === "object") : [];
const decimal = (value: unknown) => new Prisma.Decimal(typeof value === "number" && Number.isFinite(value) || typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? String(value) : "0");
const sum = (items: Row[], field: string) => items.reduce<Prisma.Decimal>((total, item) => total.plus(decimal(item[field])), new Prisma.Decimal(0));
const completed = new Set(["installation_done", "act_signed", "payment_received", "completed", "review_received", "cancelled", "canceled", "lost"]);
export const GOOGLE_ADS_REPORT_TIME_ZONE = "America/Los_Angeles";

export function googleAdsDate(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: GOOGLE_ADS_REPORT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function defaultGoogleAdsRange(now = new Date(), days = 30) {
  const end = new Date(`${googleAdsDate(now)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return { startDate: new Date(end.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

/** Read the existing receipts, warehouse issue, accruals and expenses once. Bank allocations are not new receipts. */
export function googleAdsProjectMoney(order: Row, workspace: Row) {
  const cancelled = ["cancelled", "canceled", "lost"].includes(String(order.status));
  const transactions: Row[] = rows(workspace.finance?.transactions).filter(item => item.orderId === order.id && item.scope !== "personal" && item.type === "expense").map(item => ({ ...item, amount: Math.abs(Number(item.amount)) }));
  const refunds = sum(transactions.filter(item => item.category === "refund"), "amount");
  const payments = rows(order.payments);
  const received = (payments.length ? sum(payments, "amount") : decimal(order.paid)).minus(refunds);
  const stages = rows(order.productionStages);
  const stagePayroll: Row[] = stages.flatMap(stage => rows(stage.payroll).map(item => ({ ...item, stageId: stage.id || null })));
  // Fixed job pay accrues at completion even when its stage snapshot is zero.
  const jobPayroll = rows(workspace.users).filter(user => user.payConfig?.type === "fixed_per_job" && (user.role === "measurer"
    ? user.id === order.measurerId && order.measurementDoneAt
    : Array.isArray(order.installerIds) && order.installerIds.includes(user.id) && order.installationDoneAt
  )).map(user => ({ userId: user.id, stageId: null, amount: user.payConfig.fixedPerJob }));
  const payouts = rows(order.payouts);
  const stagedServices = new Set(stages.map(stage => stage.serviceId));
  const unstagedWork = rows(order.measurements?.rooms).some(room => rows(room.windows).some(win => !stagedServices.has(win.offeringId ? `offering:${win.offeringId}` : `direction:${win.measureScope || order.serviceType || "solar_film"}`)))
    || rows(order.extraServices).some(line => !stagedServices.has(`line:${line.id}`));
  const payrollReviewUserIds = rows(workspace.users).filter(user => user.payConfig?.type === "commission"
    ? user.id === order.managerId && order.paidAt && Number(user.payConfig.commissionPct) > 0
    : user.payConfig?.type === "per_sqft" && unstagedWork && order.installationDoneAt && Array.isArray(order.installerIds) && order.installerIds.includes(user.id)
  ).map(user => user.id);
  // Dynamic legacy pay needs an owner's settlement review, not a second pricing calculator.
  const payrollOrder = Object.fromEntries(["status", "managerId", "installerIds", "paidAt", "installationDoneAt", "payments", "paid", "extraServices", "measurements", "productionStages", "serviceType", "serviceTypes", "offeringIds", "excludedProjectDirections", "serviceScopeApprovals", "complexity", "priceOverridePerSqft", "serviceSchedules"].map(key => [key, order[key]]));
  const payrollSettings = Object.fromEntries(["catalog", "complexityCoefs", "installerRates", "serviceOfferings", "seniorInstallerBonusPct"].map(key => [key, workspace.settings?.[key]]));
  const payrollReviewBasis = payrollReviewUserIds.length ? createHash("sha256").update(JSON.stringify({ order: payrollOrder, users: rows(workspace.users).filter(user => payrollReviewUserIds.includes(user.id)).map(user => ({ id: user.id, role: user.role, installerLevel: user.installerLevel, payConfig: user.payConfig })), settings: payrollSettings }, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest("hex") : null;
  const unpaidPayroll = [...stagePayroll, ...jobPayroll].reduce<Prisma.Decimal>((total, item) => {
    const paid = sum(payouts.filter(payout => payout.userId === item.userId && (payout.stageId || null) === item.stageId), "amount");
    return total.plus(Prisma.Decimal.max(0, decimal(item.amount).minus(paid)));
  }, new Prisma.Decimal(0));
  const labor = Prisma.Decimal.max(sum(payouts, "amount").plus(unpaidPayroll), sum(transactions.filter(item => item.category === "payroll"), "amount"));
  const expenses = rows(order.extraExpenses);
  const actualExpenses = expenses.filter(item => item.actual === true || item.paid === true || item.paidAt);
  const serviceMaterials = (cancelled ? [] : rows(order.extraServices)).filter(item => item.offeringId && !item.quickProjectLine && item.unit && item.unit !== "sqft").map(item => ({
    id: item.id, offeringId: item.offeringId, unit: item.unit, qty: item.qty,
    unitCost: item.offeringMaterialCost ?? rows(workspace.settings?.serviceOfferings).find(offering => offering.id === item.offeringId)?.materialCostPerUnit,
  }));
  const serviceMaterial = serviceMaterials.reduce<Prisma.Decimal>((total, item) => total.plus(
    Prisma.Decimal.max(0, decimal(item.qty)).times(Prisma.Decimal.max(0, decimal(item.unitCost))),
  ), new Prisma.Decimal(0));
  const warehouseMaterial = decimal(order._inventoryMaterialCost);
  const material = warehouseMaterial.plus(serviceMaterial);
  const warehouseAvailable = order._inventoryDeducted === true && Number.isFinite(order._inventoryMaterialCost) && warehouseMaterial.gt(0);
  const materialCoverage = { warehouse: warehouseAvailable, service_material: serviceMaterial.gt(0) };
  const issuedRollIds = new Set(rows(order._inventoryLog).filter(item => item.rollId && !item.warning && Number.isFinite(item.materialCost) && item.materialCost > 0).map(item => item.rollId));
  // A stock receipt buys the whole roll; this project bears only its issued film cost.
  const stockReceipt = (item: Row) => warehouseAvailable && item.category === "inventory_purchase" && !item.projectExpenseId && !["separate", "service_material"].includes(item.inventoryCostTreatment) && issuedRollIds.has(item.inventoryId);
  const materialLinked = (item: Row) => item.category === "inventory_purchase" && item.projectExpenseId === null && (item.inventoryCostTreatment === "warehouse" && materialCoverage.warehouse || item.inventoryCostTreatment === "service_material" && materialCoverage.service_material);
  const directCategories = new Set(["inventory_purchase", "project_expense", "subcontractor", "complaint", "delivery", "tools", "bank_fee", "other"]);
  const directTransactions = transactions.filter(item => (item.category === "inventory_purchase" || item.costBehavior !== "fixed") && (directCategories.has(item.category) || (["vehicle", "rent"].includes(item.category) && item.costBehavior === "variable")));
  const warehousePayments = directTransactions.filter(item => materialLinked(item) && item.inventoryCostTreatment === "warehouse" && !stockReceipt(item));
  const servicePayments = directTransactions.filter(item => materialLinked(item) && item.inventoryCostTreatment === "service_material");
  const expenseTransactions = directTransactions.filter(item => !materialLinked(item) && !stockReceipt(item));
  const sourceExpenseIds = new Set(actualExpenses.map(item => item.id).filter(Boolean));
  const unresolvedExpenseLinks = directTransactions.filter(item => !stockReceipt(item) && (
    item.projectExpenseId && !sourceExpenseIds.has(item.projectExpenseId)
    || item.category === "inventory_purchase" && (materialCoverage.warehouse || materialCoverage.service_material) && !sourceExpenseIds.has(item.projectExpenseId) && !materialLinked(item) && !(item.inventoryCostTreatment === "separate" && item.projectExpenseId === null)
    || item.source !== "allocation" && !Object.hasOwn(item, "projectExpenseId") && actualExpenses.length > 0));
  const allocations = expenseTransactions.filter(item => item.source === "allocation" && !Object.hasOwn(item, "projectExpenseId"));
  const allocated = actualExpenses.reduce<Prisma.Decimal>((total, expense) => total.plus(Prisma.Decimal.max(
    decimal(expense.amount), sum(expenseTransactions.filter(item => expense.id && item.projectExpenseId === expense.id), "amount"),
  )), new Prisma.Decimal(0));
  const standalone = expenseTransactions.filter(item => !allocations.includes(item) && !sourceExpenseIds.has(item.projectExpenseId));
  const directExpenses = Prisma.Decimal.max(allocated, sum(allocations, "amount")).plus(sum(standalone, "amount"));
  const hasFilm = rows(order.measurements?.rooms).some(room => rows(room.windows).length > 0)
    || rows(order.extraServices).some(item => item.quickProjectLine && item.unit === "sqft");
  const issues: string[] = [];
  if (payrollReviewUserIds.length && order.googleAdsPayrollReview?.basis !== payrollReviewBasis) issues.push("payroll_not_settled");
  if (serviceMaterials.some(item => [item.qty, item.unitCost].some(value => !(typeof value === "number" && Number.isFinite(value) && value >= 0 || typeof value === "string" && /^\d+(\.\d+)?$/.test(value))))) issues.push("material_cost_not_verified");
  if (unresolvedExpenseLinks.length) issues.push("expense_links_not_reviewed");
  if (!completed.has(String(order.status))) issues.push("project_not_completed");
  if ((hasFilm && !cancelled || order._inventoryDeducted === true) && (order._inventoryDeducted !== true || !Number.isFinite(order._inventoryMaterialCost) || rows(order._inventoryLog).some(item => item.warning))) issues.push("material_cost_not_verified");
  if (!cancelled && stages.some(stage => stage.status !== "done")) issues.push("work_not_completed");
  if (!cancelled && expenses.some(item => !(item.actual === true || item.paid === true || item.paidAt))) issues.push("expenses_not_actual");
  if ([...stagePayroll, ...jobPayroll, ...payouts, ...actualExpenses, ...directTransactions].some(item => !Number.isFinite(Number(item.amount)))) issues.push("invalid_cost_records");
  const parts = Prisma.Decimal.max(0, sum(warehousePayments, "amount").minus(warehouseMaterial)).plus(Prisma.Decimal.max(0, sum(servicePayments, "amount").minus(serviceMaterial)));
  const directCost = material.plus(parts).plus(labor).plus(directExpenses);
  // Confirm the source facts, not another editable money total. Later changes invalidate the review.
  const fingerprint = createHash("sha256").update(JSON.stringify({ status: order.status, material: material.toString(), serviceMaterials, parts: parts.toString(), labor: labor.toString(), expenses: directExpenses.toString(), stages, jobPayroll, payrollReviewBasis, sourceExpenses: expenses, bankExpenses: directTransactions, payouts: order.payouts, inventory: order._inventoryLog, issues })).digest("hex");
  return { received, directCost, fingerprint, issues, payrollReviewBasis, payrollReviewUserIds, materialCoverage, unresolvedExpenseLinks: unresolvedExpenseLinks.map(item => ({ transaction_id: item.id, amount: decimal(item.amount).toFixed(2), category: item.category, warehouse_available: materialCoverage.warehouse && item.category === "inventory_purchase", service_material_available: materialCoverage.service_material && item.category === "inventory_purchase" })), expenseChoices: actualExpenses.map(item => ({ expense_id: item.id, label: String(item.label || item.type || item.id), amount: decimal(item.amount).toFixed(2) })), costsConfirmed: issues.length === 0 && order.googleAdsCostsReview?.fingerprint === fingerprint };
}

type Cost = { customer_id: string; campaign_id: string; campaign_name: string | null; currency: string; cost_amount: Prisma.Decimal; clicks: bigint; impressions: bigint };
export type CampaignTouchpoint = { acquisition_touchpoint_id: string; lead_id: string | null; legacy_order_id: string | null; google_ads_customer_id: string | null; google_ads_campaign_id: string | null; captured_at: Date; gclid?: string | null; gbraid?: string | null; wbraid?: string | null; utm_source?: string | null };

/** Acquisition cohort: spend and leads in the selected dates, those jobs' receipts/costs as of now. */
export function buildGoogleAdsCampaignReport(costs: Cost[], touchpoints: CampaignTouchpoint[], workspace: Row, startDate: string, endDate: string, customerId: string | null) {
  const projects = legacyProjectsIncludingArchive(workspace) as Row[];
  const groups = new Map<string, Row>();
  const group = (account: string, campaign: string, currency: string) => {
    const key = `${account}|${campaign}|${currency}`;
    if (!groups.has(key)) groups.set(key, { customer_id: account, campaign_id: campaign, campaign_name: campaign, currency, ad_spend: new Prisma.Decimal(0), received: new Prisma.Decimal(0), realized_revenue: new Prisma.Decimal(0), direct_cost: new Prisma.Decimal(0), clicks: 0n, impressions: 0n, leads: new Set<string>(), won: 0, projects: [] as Row[], pending_cost_reviews: 0 });
    return groups.get(key)!;
  };
  for (const cost of costs) {
    if (customerId && cost.customer_id !== customerId) continue;
    const row = group(cost.customer_id, cost.campaign_id, cost.currency);
    row.ad_spend = row.ad_spend.plus(cost.cost_amount);
    row.campaign_name = cost.campaign_name || cost.campaign_id;
    row.clicks += cost.clicks; row.impressions += cost.impressions;
  }
  const byLead = new Map<string, CampaignTouchpoint>();
  const byOrder = new Map<string, CampaignTouchpoint>();
  for (const point of [...touchpoints].sort((a, b) => a.captured_at.getTime() - b.captured_at.getTime())) {
    if (point.google_ads_customer_id && point.google_ads_campaign_id && point.lead_id && !byLead.has(point.lead_id)) byLead.set(point.lead_id, point);
    if (point.legacy_order_id && !byOrder.has(point.legacy_order_id)) byOrder.set(point.legacy_order_id, point);
  }
  const inCohort = (point: CampaignTouchpoint) => googleAdsDate(point.captured_at) >= startDate && googleAdsDate(point.captured_at) <= endDate;
  const knownPoint = (point: CampaignTouchpoint | undefined) => point && point.google_ads_customer_id && point.google_ads_campaign_id && (!customerId || point.google_ads_customer_id === customerId) && inCohort(point);
  const claimedLeads = new Set<string>();
  let unattributedProjects = 0;
  for (const order of projects) {
    const point = byOrder.get(order.id) ?? byLead.get(order.canonicalLeadId);
    if (!knownPoint(point)) {
      if ((!point || inCohort(point)) && (/google/i.test(String(order.leadSource || order.source || "")) || touchpoints.some(item => item.lead_id === order.canonicalLeadId && (item.gclid || item.gbraid || item.wbraid || item.google_ads_campaign_id || item.utm_source?.toLowerCase() === "google")))) unattributedProjects += 1;
      continue;
    }
    const currency = String(order.currency || "USD").toUpperCase();
    const row = group(point!.google_ads_customer_id!, point!.google_ads_campaign_id!, currency);
    const leadKey = point!.lead_id || order.id;
    row.leads.add(leadKey); claimedLeads.add(leadKey);
    const money = googleAdsProjectMoney(order, workspace);
    row.received = row.received.plus(money.received);
    if (!["cancelled", "canceled", "lost"].includes(String(order.status)) && (order.depositReceived || completed.has(String(order.status)))) row.won += 1;
    if (completed.has(String(order.status))) {
      row.realized_revenue = row.realized_revenue.plus(money.received);
      row.direct_cost = row.direct_cost.plus(money.directCost);
      if (!money.costsConfirmed) row.pending_cost_reviews += 1;
    } else row.pending_cost_reviews += 1;
    row.projects.push({ order_id: order.id, number: order.number || order.id, status: order.status, received: money.received.toFixed(2), direct_cost: money.directCost.toFixed(2), costs_confirmed: money.costsConfirmed, cost_fingerprint: money.fingerprint, issues: money.issues, payroll_review_user_ids: money.payrollReviewUserIds, expense_links: money.unresolvedExpenseLinks, expense_choices: money.expenseChoices });
  }
  for (const point of byLead.values()) {
    if (!knownPoint(point) || claimedLeads.has(point.lead_id!)) continue;
    const currencies = costs.filter(cost => cost.customer_id === point.google_ads_customer_id && cost.campaign_id === point.google_ads_campaign_id).map(cost => cost.currency);
    // A lead without a job has no currency. Never invent one across mixed feeds.
    if (new Set(currencies).size === 1) group(point.google_ads_customer_id!, point.google_ads_campaign_id!, currencies[0]).leads.add(point.lead_id!);
  }
  return {
    start_date: startDate, end_date: endDate, customer_id: customerId, time_zone: GOOGLE_ADS_REPORT_TIME_ZONE,
    basis: "acquisition_cohort_paid_completed_jobs", as_of: new Date().toISOString(), unattributed_projects: unattributedProjects,
    campaigns: [...groups.values()].map(row => ({
      customer_id: row.customer_id, campaign_id: row.campaign_id, campaign_name: row.campaign_name, currency: row.currency, won: row.won, projects: row.projects, pending_cost_reviews: row.pending_cost_reviews, ad_spend: row.ad_spend.toFixed(6), received: row.received.toFixed(2), realized_revenue: row.realized_revenue.toFixed(2), direct_cost: row.direct_cost.toFixed(2), clicks: row.clicks.toString(), impressions: row.impressions.toString(), leads: row.leads.size,
      cost_per_lead: row.leads.size && row.ad_spend.gt(0) ? row.ad_spend.div(row.leads.size).toFixed(2) : null,
      roas: row.ad_spend.gt(0) ? row.realized_revenue.div(row.ad_spend).toFixed(4) : null,
      roi_percent: row.ad_spend.gt(0) && !row.pending_cost_reviews ? row.realized_revenue.minus(row.direct_cost).minus(row.ad_spend).div(row.ad_spend).times(100).toFixed(2) : null,
    })).sort((a, b) => Number(b.ad_spend) - Number(a.ad_spend)),
    projects_without_campaign: projects.filter(order => !byOrder.has(order.id) && !byLead.has(order.canonicalLeadId)).map(order => ({ order_id: order.id, number: order.number || order.id })),
  };
}

export async function getGoogleAdsCampaignReport(startDate?: string | null, endDate?: string | null, requestedCustomerId?: string | null) {
  const defaults = defaultGoogleAdsRange();
  if (Boolean(startDate) !== Boolean(endDate)) throw new GoogleAdsRoasError("date_range_required", "Both start_date and end_date are required.");
  const start = startDate || defaults.startDate, end = endDate || defaults.endDate;
  const range = validateRoasRange(start, end);
  const [costs, touchpoints, workspace, settings] = await Promise.all([
    prisma.googleAdsDailyCost.findMany({ where: { segments_date: { gte: range.start, lte: range.end } }, orderBy: { segments_date: "asc" } }),
    prisma.acquisitionTouchpoint.findMany({ where: { captured_at: { lt: new Date(range.endExclusive.getTime() + 86_400_000) } }, orderBy: { captured_at: "asc" } }),
    prisma.legacyWorkspace.findUnique({ where: { workspace_id: "primary" }, select: { payload: true } }),
    prisma.googleAdsIntegrationSetting.findUnique({ where: { setting_key: "default" }, select: { conversion_owner_customer_id: true } }),
  ]);
  const accounts = [...new Set(costs.map(row => row.customer_id))];
  const customer = selectGoogleAdsReportCustomer(accounts, settings?.conversion_owner_customer_id, requestedCustomerId);
  const selectionRequired = !customer && accounts.length > 1;
  return { ...buildGoogleAdsCampaignReport(selectionRequired ? [] : costs, selectionRequired ? [] : touchpoints, (workspace?.payload || {}) as Row, start, end, customer), available_accounts: accounts.sort(), selection_required: selectionRequired };
}
