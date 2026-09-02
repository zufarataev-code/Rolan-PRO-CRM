import { prisma } from "@/lib/db";
import { calculatePositionFinance, listProjectsForSession } from "@/features/projects/service";
import { calculateProratedCompanyOverhead, readCompanyOverheadConfig } from "@/lib/finance/company-overhead";
import { getBusinessPlanningSnapshot } from "@/lib/finance/business-planning";

type OwnerSession = {
  user: {
    user_id: string;
  };
  roles: string[];
};

const PRODUCT_PNL_CONFIG = [
  { service_code: "SMART_FILM", name_ru: "Смарт-плёнка установка" },
  { service_code: "SAFETY_FILM", name_ru: "Защитная плёнка установка" },
  { service_code: "SOLAR_FILM", name_ru: "Солнцезащитная плёнка установка" },
] as const;

export const OWNER_SERVICE_PNL_PERIOD_OPTIONS = [
  { key: "30d", label_ru: "30 дней" },
  { key: "90d", label_ru: "90 дней" },
  { key: "365d", label_ru: "12 месяцев" },
  { key: "mtd", label_ru: "MTD" },
  { key: "qtd", label_ru: "QTD" },
  { key: "ytd", label_ru: "YTD" },
  { key: "all", label_ru: "Все время" },
] as const;

type ServicePnlPeriodKey = (typeof OWNER_SERVICE_PNL_PERIOD_OPTIONS)[number]["key"];

function toMoney(value: number) {
  return Number(value.toFixed(2));
}

function toNumber(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  return Number(value.toString());
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function getInclusiveDayCount(startDate: Date, endDate: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((startOfUtcDay(endDate).getTime() - startOfUtcDay(startDate).getTime()) / msPerDay) + 1;
}

function normalizeServicePnlPeriod(value?: string | null): ServicePnlPeriodKey {
  return OWNER_SERVICE_PNL_PERIOD_OPTIONS.some((item) => item.key === value) ? (value as ServicePnlPeriodKey) : "30d";
}

function resolveServicePnlDateRange(period: ServicePnlPeriodKey, now = new Date()) {
  const endDate = startOfUtcDay(now);

  if (period === "all") {
    return {
      key: period,
      label_ru: OWNER_SERVICE_PNL_PERIOD_OPTIONS.find((item) => item.key === period)?.label_ru ?? "Все время",
      date_from: null,
      date_to: null,
    };
  }

  let startDate = new Date(endDate);

  switch (period) {
    case "90d":
      startDate.setUTCDate(startDate.getUTCDate() - 89);
      break;
    case "365d":
      startDate.setUTCDate(startDate.getUTCDate() - 364);
      break;
    case "mtd":
      startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
      break;
    case "qtd": {
      const quarterStartMonth = Math.floor(endDate.getUTCMonth() / 3) * 3;
      startDate = new Date(Date.UTC(endDate.getUTCFullYear(), quarterStartMonth, 1));
      break;
    }
    case "ytd":
      startDate = new Date(Date.UTC(endDate.getUTCFullYear(), 0, 1));
      break;
    case "30d":
    default:
      startDate.setUTCDate(startDate.getUTCDate() - 29);
      break;
  }

  return {
    key: period,
    label_ru: OWNER_SERVICE_PNL_PERIOD_OPTIONS.find((item) => item.key === period)?.label_ru ?? "30 дней",
    date_from: startDate,
    date_to: endDate,
  };
}

function getPositionActivityDate(position: {
  created_at: Date;
  project: {
    created_at: Date;
    install_date: Date | null;
  };
}) {
  return position.project.install_date ?? position.project.created_at ?? position.created_at;
}

async function getServicePnlRows(input?: {
  service_codes?: string[];
  date_from?: Date | null;
  date_to?: Date | null;
}) {
  const serviceWhere = {
    is_active: true,
    ...(input?.service_codes?.length
      ? {
          service_code: {
            in: input.service_codes,
          },
        }
      : {}),
  } as const;

  const [serviceTypes, positions] = await Promise.all([
    prisma.serviceType.findMany({
      where: serviceWhere,
      orderBy: {
        sort_order: "asc",
      },
      select: {
        service_type_id: true,
        service_code: true,
        name_ru: true,
        unit_type: true,
      },
    }),
    prisma.projectPosition.findMany({
      where: {
        service_type: serviceWhere,
      },
      include: {
        project: {
          select: {
            project_id: true,
            created_at: true,
            install_date: true,
          },
        },
        service_type: {
          select: {
            service_type_id: true,
            service_code: true,
            name_ru: true,
            unit_type: true,
            material_cost_per_sqft: true,
            installation_cost_per_sqft: true,
            block_revenue_price: true,
            block_cost_price: true,
          },
        },
        complexity_level: {
          select: {
            multiplier: true,
            name_ru: true,
          },
        },
        position_addons: {
          include: {
            service_addon: {
              select: {
                addon_code: true,
                name_ru: true,
                min_price: true,
                cost_price: true,
                unit_type: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const dateFrom = input?.date_from ? startOfUtcDay(input.date_from) : null;
  const dateTo = input?.date_to ? startOfUtcDay(input.date_to) : null;
  const filteredPositions = positions.filter((position) => {
    const activityDate = startOfUtcDay(getPositionActivityDate(position));

    if (dateFrom && activityDate.getTime() < dateFrom.getTime()) {
      return false;
    }

    if (dateTo && activityDate.getTime() > dateTo.getTime()) {
      return false;
    }

    return true;
  });

  const allProjectIds = new Set<string>();
  let activityDateMin: Date | null = null;
  let activityDateMax: Date | null = null;
  const bucketMap = new Map(
    serviceTypes.map((serviceType) => [
      serviceType.service_type_id,
      {
        service_type_id: serviceType.service_type_id,
        service_code: serviceType.service_code,
        name_ru: serviceType.name_ru,
        unit_type: serviceType.unit_type,
        positions_count: 0,
        project_ids: new Set<string>(),
        billable_sqft_total: 0,
        actual_film_sqft_total: 0,
        revenue_total: 0,
        material_cost_total: 0,
        installation_cost_total: 0,
        block_cost_total: 0,
        addon_cost_total: 0,
        variable_expenses_total: 0,
        fixed_expenses_total: 0,
        other_costs_total: 0,
        estimated_cost_total: 0,
        estimated_profit_total: 0,
      },
    ]),
  );

  for (const position of filteredPositions) {
    const bucket = bucketMap.get(position.service_type.service_type_id);

    if (!bucket) {
      continue;
    }

    const activityDate = startOfUtcDay(getPositionActivityDate(position));

    if (!activityDateMin || activityDate.getTime() < activityDateMin.getTime()) {
      activityDateMin = activityDate;
    }

    if (!activityDateMax || activityDate.getTime() > activityDateMax.getTime()) {
      activityDateMax = activityDate;
    }

    const finance = calculatePositionFinance(position);
    const variableExpensesTotal =
      finance.material_cost_total +
      finance.installation_cost_total +
      finance.block_cost_total +
      finance.addon_cost_total;
    const fixedExpensesTotal = finance.extra_costs_total;
    const otherCostsTotal = finance.block_cost_total + finance.addon_cost_total + fixedExpensesTotal;

    bucket.positions_count += 1;
    bucket.project_ids.add(position.project_id);
    allProjectIds.add(position.project_id);
    bucket.billable_sqft_total += finance.billable_sqft;
    bucket.actual_film_sqft_total += finance.actual_film_sqft;
    bucket.revenue_total += finance.revenue_subtotal;
    bucket.material_cost_total += finance.material_cost_total;
    bucket.installation_cost_total += finance.installation_cost_total;
    bucket.block_cost_total += finance.block_cost_total;
    bucket.addon_cost_total += finance.addon_cost_total;
    bucket.variable_expenses_total += variableExpensesTotal;
    bucket.fixed_expenses_total += fixedExpensesTotal;
    bucket.other_costs_total += otherCostsTotal;
    bucket.estimated_cost_total += finance.estimated_cost;
    bucket.estimated_profit_total += finance.estimated_profit;
  }

  return {
    services_count: serviceTypes.length,
    projects_count: allProjectIds.size,
    activity_range: {
      start_date: activityDateMin,
      end_date: activityDateMax,
      days_count: activityDateMin && activityDateMax ? getInclusiveDayCount(activityDateMin, activityDateMax) : 0,
    },
    rows: serviceTypes.map((serviceType) => {
      const bucket = bucketMap.get(serviceType.service_type_id);
      const revenueTotal = toMoney(bucket?.revenue_total ?? 0);
      const estimatedCostTotal = toMoney(bucket?.estimated_cost_total ?? 0);
      const estimatedProfitTotal = toMoney(bucket?.estimated_profit_total ?? 0);
      const marginPercent = revenueTotal > 0 ? toMoney((estimatedProfitTotal / revenueTotal) * 100) : 0;

      return {
        service_type_id: serviceType.service_type_id,
        service_code: serviceType.service_code,
        name_ru: serviceType.name_ru,
        unit_type: serviceType.unit_type,
        positions_count: bucket?.positions_count ?? 0,
        projects_count: bucket?.project_ids.size ?? 0,
        billable_sqft_total: toMoney(bucket?.billable_sqft_total ?? 0),
        actual_film_sqft_total: toMoney(bucket?.actual_film_sqft_total ?? 0),
        revenue_total: revenueTotal,
        material_cost_total: toMoney(bucket?.material_cost_total ?? 0),
        installation_cost_total: toMoney(bucket?.installation_cost_total ?? 0),
        block_cost_total: toMoney(bucket?.block_cost_total ?? 0),
        addon_cost_total: toMoney(bucket?.addon_cost_total ?? 0),
        variable_expenses_total: toMoney(bucket?.variable_expenses_total ?? 0),
        fixed_expenses_total: toMoney(bucket?.fixed_expenses_total ?? 0),
        other_costs_total: toMoney(bucket?.other_costs_total ?? 0),
        estimated_cost_total: estimatedCostTotal,
        estimated_profit_total: estimatedProfitTotal,
        margin_percent: marginPercent,
      };
    }),
  };
}

export async function getOwnerDashboardData(session: OwnerSession) {
  const now = new Date();
  const [projects, leadsCount, dealsCount, proposals, deposits, overdueFollowUpsCount, overdueTasksCount, planning] =
    await Promise.all([
      listProjectsForSession(session),
      prisma.lead.count(),
      prisma.deal.count(),
      prisma.proposal.findMany({
        orderBy: {
          updated_at: "desc",
        },
        include: {
          client: {
            select: {
              client_id: true,
              name: true,
            },
          },
          deal: {
            select: {
              deal_id: true,
              deal_code: true,
              title: true,
            },
          },
          deposit: {
            select: {
              deposit_id: true,
              amount: true,
              status: true,
              paid_at: true,
            },
          },
          project: {
            select: {
              project_id: true,
              project_code: true,
              title: true,
            },
          },
        },
        take: 40,
      }),
      prisma.deposit.findMany({
        orderBy: {
          created_at: "desc",
        },
        include: {
          proposal: {
            select: {
              proposal_id: true,
              proposal_code: true,
              title: true,
              client: {
                select: {
                  client_id: true,
                  name: true,
                },
              },
            },
          },
        },
        take: 30,
      }),
      prisma.followUp.count({
        where: {
          status: "scheduled",
          due_at: {
            lt: now,
          },
        },
      }),
      prisma.task.count({
        where: {
          status: {
            in: ["open", "in_progress"],
          },
          due_at: {
            lt: now,
          },
        },
      }),
      getBusinessPlanningSnapshot(),
    ]);

  const totalSales = proposals.reduce((sum, proposal) => sum + toNumber(proposal.selected_total_amount), 0);
  const depositsReceived = deposits
    .filter((deposit) => deposit.status === "paid")
    .reduce((sum, deposit) => sum + toNumber(deposit.amount), 0);
  const depositsPending = deposits
    .filter((deposit) => deposit.status !== "paid")
    .reduce((sum, deposit) => sum + toNumber(deposit.amount), 0);

  const unpaidBalance = proposals.reduce((sum, proposal) => {
    const proposalTotal = toNumber(proposal.selected_total_amount);
    const depositPaid = proposal.deposit?.status === "paid" ? toNumber(proposal.deposit.amount) : 0;
    return sum + Math.max(proposalTotal - depositPaid, 0);
  }, 0);

  const waitingSchedule = projects.filter((project) => !project.schedule && project.project_status.status_code !== "COMPLETED")
    .length;
  const inProgressProjects = projects.filter((project) => project.project_status.status_code === "IN_PROGRESS").length;
  const lowMarginProjects = projects.filter((project) => project.finance_snapshot.margin_percent < 25).length;
  const problemProjects = projects.filter((project) => project.problem_flag || project.status_flags.needs_attention).length;

  return {
    metrics: {
      leads_count: leadsCount,
      deals_count: dealsCount,
      total_sales_value: Number(totalSales.toFixed(2)),
      deposits_received: Number(depositsReceived.toFixed(2)),
      deposits_pending: Number(depositsPending.toFixed(2)),
      unpaid_balance: Number(unpaidBalance.toFixed(2)),
      waiting_schedule: waitingSchedule,
      in_progress_projects: inProgressProjects,
      low_margin_projects: lowMarginProjects,
      problem_projects: problemProjects,
      overdue_follow_ups: overdueFollowUpsCount,
      overdue_tasks: overdueTasksCount,
    },
    attention_projects: projects
      .filter((project) => project.problem_flag || project.status_flags.is_overdue || project.finance_snapshot.margin_percent < 25)
      .slice(0, 8),
    recent_deposits: deposits,
    planning,
    recent_proposals: proposals.slice(0, 8).map((proposal) => ({
      proposal_id: proposal.proposal_id,
      proposal_code: proposal.proposal_code,
      title: proposal.title,
      status: proposal.status,
      client: proposal.client,
      deal: proposal.deal,
      project: proposal.project,
      selected_total_amount: toNumber(proposal.selected_total_amount),
      deposit: proposal.deposit
        ? {
            deposit_id: proposal.deposit.deposit_id,
            amount: toNumber(proposal.deposit.amount),
            status: proposal.deposit.status,
            paid_at: proposal.deposit.paid_at,
          }
        : null,
    })),
  };
}

export async function getOwnerFinanceData(session: OwnerSession) {
  const [projects, deposits, proposals, productPnlData] = await Promise.all([
    listProjectsForSession(session),
    prisma.deposit.findMany({
      orderBy: {
        created_at: "desc",
      },
      include: {
        proposal: {
          select: {
            proposal_id: true,
            proposal_code: true,
            title: true,
            client: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.proposal.findMany({
      orderBy: {
        updated_at: "desc",
      },
      include: {
        client: {
          select: {
            name: true,
          },
        },
        deal: {
          select: {
            deal_id: true,
            deal_code: true,
            title: true,
          },
        },
        deposit: true,
        project: {
          select: {
            project_id: true,
            project_code: true,
            title: true,
          },
        },
      },
    }),
    getServicePnlRows({
      service_codes: PRODUCT_PNL_CONFIG.map((item) => item.service_code),
    }),
  ]);

  const financeProjects = projects.map((project) => ({
    project_id: project.project_id,
    project_code: project.project_code,
    title: project.title,
    client_name: project.client?.name ?? "—",
    project_status: project.project_status.name_ru,
    revenue_total: project.finance_snapshot.revenue_total,
    estimated_profit_total: project.finance_snapshot.estimated_profit_total,
    margin_percent: project.finance_snapshot.margin_percent,
    schedule: project.schedule,
    problem_flag: project.problem_flag,
  }));

  const receivables = proposals.map((proposal) => {
    const total = toNumber(proposal.selected_total_amount);
    const paidDeposit = proposal.deposit?.status === "paid" ? toNumber(proposal.deposit.amount) : 0;
    const balanceDue = Math.max(total - paidDeposit, 0);

    return {
      proposal_id: proposal.proposal_id,
      proposal_code: proposal.proposal_code,
      title: proposal.title,
      status: proposal.status,
      client_name: proposal.client.name,
      deal: proposal.deal,
      project: proposal.project,
      total,
      deposit_received: paidDeposit,
      balance_due: balanceDue,
    };
  });

  const productPnLNameMap = new Map<string, string>(
    PRODUCT_PNL_CONFIG.map((item) => [item.service_code, item.name_ru]),
  );
  const product_pnl = productPnlData.rows.map((row) => ({
    ...row,
    name_ru: productPnLNameMap.get(row.service_code) ?? row.name_ru,
  }));

  return {
    deposits: deposits.map((deposit) => ({
      deposit_id: deposit.deposit_id,
      amount: toNumber(deposit.amount),
      status: deposit.status,
      paid_at: deposit.paid_at,
      created_at: deposit.created_at,
      proposal: {
        proposal_id: deposit.proposal.proposal_id,
        proposal_code: deposit.proposal.proposal_code,
        title: deposit.proposal.title,
        client_name: deposit.proposal.client.name,
      },
    })),
    receivables,
    finance_projects: financeProjects,
    product_pnl,
  };
}

export async function getOwnerServicePnlData(_session: OwnerSession, input?: { period?: string | null }) {
  const period = normalizeServicePnlPeriod(input?.period);
  const periodRange = resolveServicePnlDateRange(period);
  const [servicePnlData, companyOverheadConfig] = await Promise.all([
    getServicePnlRows({
      date_from: periodRange.date_from,
      date_to: periodRange.date_to,
    }),
    readCompanyOverheadConfig(),
  ]);

  const companyOverhead = calculateProratedCompanyOverhead(companyOverheadConfig, {
    start_date: periodRange.date_from ?? servicePnlData.activity_range.start_date,
    end_date: periodRange.date_to ?? servicePnlData.activity_range.end_date,
  });
  const revenueTotal = servicePnlData.rows.reduce((sum, row) => sum + row.revenue_total, 0);
  const variableExpensesTotal = servicePnlData.rows.reduce((sum, row) => sum + row.variable_expenses_total, 0);
  const fixedExpensesTotal = servicePnlData.rows.reduce((sum, row) => sum + row.fixed_expenses_total, 0);
  const estimatedCostTotal = servicePnlData.rows.reduce((sum, row) => sum + row.estimated_cost_total, 0);
  const estimatedProfitTotal = servicePnlData.rows.reduce((sum, row) => sum + row.estimated_profit_total, 0);
  const positionsCount = servicePnlData.rows.reduce((sum, row) => sum + row.positions_count, 0);
  const service_pnl = servicePnlData.rows.map((row) => {
    const companyOverheadAllocatedTotal =
      revenueTotal > 0 ? toMoney((companyOverhead.total_period_amount * row.revenue_total) / revenueTotal) : 0;
    const netProfitTotal = toMoney(row.estimated_profit_total - companyOverheadAllocatedTotal);
    const netMarginPercent = row.revenue_total > 0 ? toMoney((netProfitTotal / row.revenue_total) * 100) : 0;

    return {
      ...row,
      company_overhead_allocated_total: companyOverheadAllocatedTotal,
      net_profit_total: netProfitTotal,
      net_margin_percent: netMarginPercent,
    };
  });
  const marginPercent = revenueTotal > 0 ? toMoney((estimatedProfitTotal / revenueTotal) * 100) : 0;
  const netProfitTotal = toMoney(estimatedProfitTotal - companyOverhead.total_period_amount);
  const netMarginPercent = revenueTotal > 0 ? toMoney((netProfitTotal / revenueTotal) * 100) : 0;

  return {
    summary: {
      period_key: periodRange.key,
      period_label: periodRange.label_ru,
      date_from: companyOverhead.start_date,
      date_to: companyOverhead.end_date,
      activity_date_from: servicePnlData.activity_range.start_date,
      activity_date_to: servicePnlData.activity_range.end_date,
      activity_days_count: servicePnlData.activity_range.days_count,
      services_count: servicePnlData.services_count,
      projects_count: servicePnlData.projects_count,
      positions_count: positionsCount,
      revenue_total: toMoney(revenueTotal),
      variable_expenses_total: toMoney(variableExpensesTotal),
      fixed_expenses_total: toMoney(fixedExpensesTotal),
      estimated_cost_total: toMoney(estimatedCostTotal),
      estimated_profit_total: toMoney(estimatedProfitTotal),
      company_overhead_total: companyOverhead.total_period_amount,
      net_profit_total: netProfitTotal,
      margin_percent: marginPercent,
      net_margin_percent: netMarginPercent,
      monthly_company_overhead_total: companyOverhead.monthly_total,
    },
    company_overhead: companyOverhead,
    service_pnl,
  };
}
