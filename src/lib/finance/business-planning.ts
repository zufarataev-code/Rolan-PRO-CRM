import { prisma } from "@/lib/db";
import { getCompanyOverheadRows, readCompanyOverheadConfig } from "@/lib/finance/company-overhead";

const PLANNING_KEY = "company";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function safeCeil(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

export function calculatePlanningTargets(input: {
  monthly_overhead: number;
  target_profit_monthly: number;
  gross_margin_percent: number;
  average_deal_value: number;
  lead_to_deal_percent: number;
  proposal_revenue: number;
}) {
  const grossMarginRatio = Math.max(0, input.gross_margin_percent) / 100;
  const conversionRatio = Math.max(0, input.lead_to_deal_percent) / 100;
  const breakEvenRevenue = grossMarginRatio > 0 ? Math.max(0, input.monthly_overhead) / grossMarginRatio : 0;
  const targetRevenue = grossMarginRatio > 0
    ? (Math.max(0, input.monthly_overhead) + Math.max(0, input.target_profit_monthly)) / grossMarginRatio
    : 0;
  const breakEvenDeals = input.average_deal_value > 0 ? safeCeil(breakEvenRevenue / input.average_deal_value) : 0;
  const targetDeals = input.average_deal_value > 0 ? safeCeil(targetRevenue / input.average_deal_value) : 0;
  const breakEvenLeads = conversionRatio > 0 ? safeCeil(breakEvenDeals / conversionRatio) : 0;
  const targetLeads = conversionRatio > 0 ? safeCeil(targetDeals / conversionRatio) : 0;
  const progressPercent = breakEvenRevenue > 0 ? Math.max(0, (Math.max(0, input.proposal_revenue) / breakEvenRevenue) * 100) : 0;
  const signal: "on_track" | "attention" | "risk" =
    progressPercent >= 100 ? "on_track" : progressPercent >= 70 ? "attention" : "risk";

  return {
    break_even: { revenue: roundMoney(breakEvenRevenue), deals: breakEvenDeals, leads: breakEvenLeads },
    target: { revenue: roundMoney(targetRevenue), deals: targetDeals, leads: targetLeads },
    progress_percent: roundMoney(progressPercent),
    signal,
  };
}

export async function readBusinessPlanningSettings() {
  return prisma.businessPlanningSetting.upsert({
    where: { planning_key: PLANNING_KEY },
    create: { planning_key: PLANNING_KEY },
    update: {},
  });
}

export async function updateBusinessPlanningSettings(input: {
  average_deal_value?: unknown;
  lead_to_deal_percent?: unknown;
  target_profit_monthly?: unknown;
}) {
  const current = await readBusinessPlanningSettings();
  const averageDealValue = Math.max(0, toNumber(input.average_deal_value ?? current.average_deal_value));
  const leadToDealPercent = Math.min(100, Math.max(0.1, toNumber(input.lead_to_deal_percent ?? current.lead_to_deal_percent)));
  const targetProfitMonthly = Math.max(0, toNumber(input.target_profit_monthly ?? current.target_profit_monthly));

  return prisma.businessPlanningSetting.update({
    where: { planning_key: PLANNING_KEY },
    data: {
      average_deal_value: averageDealValue,
      lead_to_deal_percent: leadToDealPercent,
      target_profit_monthly: targetProfitMonthly,
    },
  });
}

export async function getBusinessPlanningSnapshot() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [settings, overheadConfig, services, leadsThisMonth, dealsThisMonth, proposalsThisMonth] = await Promise.all([
    readBusinessPlanningSettings(),
    readCompanyOverheadConfig(),
    prisma.serviceType.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.lead.count({ where: { created_at: { gte: monthStart } } }),
    prisma.deal.count({ where: { created_at: { gte: monthStart } } }),
    prisma.proposal.findMany({
      where: { created_at: { gte: monthStart } },
      select: { selected_total_amount: true },
    }),
  ]);

  const contributionRows = services
    .map((service) => {
      const revenue = toNumber(service.base_price);
      const variableCost =
        toNumber(service.material_cost_per_sqft) + toNumber(service.installation_cost_per_sqft);
      return revenue > 0 ? Math.max(0, Math.min(1, (revenue - variableCost) / revenue)) : null;
    })
    .filter((value): value is number => value !== null);
  const grossMarginRatio = contributionRows.length
    ? contributionRows.reduce((sum, value) => sum + value, 0) / contributionRows.length
    : 0;
  const monthlyOverhead = getCompanyOverheadRows(overheadConfig).reduce(
    (sum, row) => sum + row.monthly_amount,
    0,
  );
  const averageDealValue = toNumber(settings.average_deal_value);
  const targetProfit = toNumber(settings.target_profit_monthly);
  const revenueThisMonth = proposalsThisMonth.reduce(
    (sum, proposal) => sum + toNumber(proposal.selected_total_amount),
    0,
  );
  const targets = calculatePlanningTargets({
    monthly_overhead: monthlyOverhead,
    target_profit_monthly: targetProfit,
    gross_margin_percent: grossMarginRatio * 100,
    average_deal_value: averageDealValue,
    lead_to_deal_percent: toNumber(settings.lead_to_deal_percent),
    proposal_revenue: revenueThisMonth,
  });

  return {
    assumptions: {
      average_deal_value: roundMoney(averageDealValue),
      lead_to_deal_percent: roundMoney(toNumber(settings.lead_to_deal_percent)),
      target_profit_monthly: roundMoney(targetProfit),
      gross_margin_percent: roundMoney(grossMarginRatio * 100),
      monthly_overhead: roundMoney(monthlyOverhead),
    },
    break_even: {
      ...targets.break_even,
    },
    target: {
      ...targets.target,
    },
    actual: {
      leads: leadsThisMonth,
      deals: dealsThisMonth,
      proposal_revenue: roundMoney(revenueThisMonth),
      progress_percent: targets.progress_percent,
      signal: targets.signal,
    },
  };
}

export function withoutInternalPlanningCosts<T extends Awaited<ReturnType<typeof getBusinessPlanningSnapshot>>>(snapshot: T) {
  return {
    ...snapshot,
    assumptions: {
      ...snapshot.assumptions,
      target_profit_monthly: 0,
      gross_margin_percent: 0,
      monthly_overhead: 0,
    },
  };
}
