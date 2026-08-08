import Link from "next/link";
import { redirect } from "next/navigation";

import { OwnerShell } from "@/components/owner-shell";
import { OWNER_ONLY_ROLES } from "@/features/owner/api";
import { OWNER_SERVICE_PNL_PERIOD_OPTIONS, getOwnerServicePnlData } from "@/features/owner/service";
import { requireAppSession } from "@/lib/auth/app-session";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: Date | null) {
  if (!value) {
    return "—";
  }

  return value.toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function clampPercent(value: number, min = 8) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(100, Math.round(value)));
}

function createPeriodHref(period: string) {
  return period === "30d" ? "/owner/finance/services" : `/owner/finance/services?period=${period}`;
}

type PageProps = {
  searchParams?: Promise<{
    period?: string | string[];
  }>;
};

export default async function OwnerServicePnlPage({ searchParams }: PageProps) {
  const session = await requireAppSession(OWNER_ONLY_ROLES);

  if (!session) {
    redirect("/");
  }

  const resolvedSearchParams = (searchParams ? await searchParams : undefined) ?? {};
  const rawPeriod = Array.isArray(resolvedSearchParams.period) ? resolvedSearchParams.period[0] : resolvedSearchParams.period;
  const data = await getOwnerServicePnlData(session, { period: rawPeriod });
  const activeServices = data.service_pnl.filter((row) => row.positions_count > 0);
  const topService = [...activeServices].sort((a, b) => b.net_profit_total - a.net_profit_total)[0] ?? null;
  const bestMarginService = [...activeServices].sort((a, b) => b.net_margin_percent - a.net_margin_percent)[0] ?? null;
  const totalExpenseBase =
    data.summary.variable_expenses_total + data.summary.fixed_expenses_total + data.summary.company_overhead_total;
  const variableExpenseShare =
    totalExpenseBase > 0 ? (data.summary.variable_expenses_total / totalExpenseBase) * 100 : 0;
  const fixedExpenseShare = totalExpenseBase > 0 ? (data.summary.fixed_expenses_total / totalExpenseBase) * 100 : 0;
  const companyOverheadShare = totalExpenseBase > 0 ? (data.summary.company_overhead_total / totalExpenseBase) * 100 : 0;

  return (
    <OwnerShell
      title="Прибыль по услугам"
      subtitle="Выручка, постоянные и переменные расходы, накладные расходы и чистая прибыль по каждой услуге."
      kicker="Аналитика / Услуги"
      activeHref="/owner/finance/services"
      actions={
        <>
          <Link href="/owner/finance" className="soft-button">
            Общие финансы
          </Link>
          <Link href="/owner/settings" className="soft-button">
            Настройки overhead
          </Link>
        </>
      }
    >
      <section className="workspace">
        <section className="workspace-hero">
          <div className="ops-hero">
            <div className="hero-command">
              <div className="hero-tag-row">
                <span className="brand-tag brand-tag-live">Service PnL</span>
                <span className="brand-tag">{data.summary.period_label}</span>
                <span className="brand-tag">Variable costs</span>
                <span className="brand-tag">Fixed costs</span>
                <span className="brand-tag">Net PnL</span>
              </div>
              <div>
                <h2 className="hero-heading">Экономика по услугам и чистая прибыль</h2>
                <p className="hero-copy">
                  Переменные расходы считаются как материалы, монтаж, блоки и addons. Постоянные расходы внутри услуг
                  считаются из extra costs, а company overhead распределяется по услугам пропорционально выручке.
                </p>
              </div>
              <div className="action-cluster">
                {OWNER_SERVICE_PNL_PERIOD_OPTIONS.map((option) => (
                  <Link
                    key={option.key}
                    href={createPeriodHref(option.key)}
                    className={option.key === data.summary.period_key ? "accent-button" : "soft-button"}
                  >
                    {option.label_ru}
                  </Link>
                ))}
              </div>
              <div className="inline-stat-grid">
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Revenue total</span>
                  <strong className="inline-stat-value">{formatCurrency(data.summary.revenue_total)}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Gross profit</span>
                  <strong className="inline-stat-value">{formatCurrency(data.summary.estimated_profit_total)}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Company overhead</span>
                  <strong className="inline-stat-value">{formatCurrency(data.summary.company_overhead_total)}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Net profit</span>
                  <strong className="inline-stat-value">{formatCurrency(data.summary.net_profit_total)}</strong>
                </div>
              </div>
            </div>

            <div className="metric-grid">
              <div className="metric-cell">
                <div className="metric-label">Период</div>
                <div className="metric-value">{data.summary.period_label}</div>
                <div className="metric-footnote">
                  {formatDate(data.summary.date_from)} - {formatDate(data.summary.date_to)}
                </div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Активных услуг</div>
                <div className="metric-value">{activeServices.length}</div>
                <div className="metric-footnote">{data.summary.positions_count} позиций в расчете</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Gross margin</div>
                <div className="metric-value">{data.summary.margin_percent.toFixed(1)}%</div>
                <div className="metric-footnote">До company overhead</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Net margin</div>
                <div className="metric-value">{data.summary.net_margin_percent.toFixed(1)}%</div>
                <div className="metric-footnote">После офисных расходов и зарплат</div>
              </div>
            </div>
          </div>
        </section>

        <section className="analytics-grid">
          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h2 className="surface-title">Структура расходов</h2>
                <p className="surface-subtitle">Раскладка service cost и company overhead внутри выбранного периода.</p>
              </div>
              <span className="chip chip-accent">{data.summary.net_margin_percent.toFixed(1)}% net margin</span>
            </div>
            <div className="signal-list">
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Variable expenses</span>
                  <strong>{formatCurrency(data.summary.variable_expenses_total)}</strong>
                </div>
                <div className="signal-bar">
                  <div
                    className="signal-bar-fill signal-bar-fill-warning"
                    style={{ width: `${clampPercent(variableExpenseShare)}%` }}
                  />
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Service fixed expenses</span>
                  <strong>{formatCurrency(data.summary.fixed_expenses_total)}</strong>
                </div>
                <div className="signal-bar">
                  <div
                    className="signal-bar-fill signal-bar-fill-danger"
                    style={{ width: `${clampPercent(fixedExpenseShare)}%` }}
                  />
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Company overhead</span>
                  <strong>{formatCurrency(data.summary.company_overhead_total)}</strong>
                </div>
                <div className="signal-bar">
                  <div
                    className="signal-bar-fill signal-bar-fill-danger"
                    style={{ width: `${clampPercent(companyOverheadShare)}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h2 className="surface-title">Лидеры периода</h2>
                <p className="surface-subtitle">Лучшие услуги уже с учетом распределенного company overhead.</p>
              </div>
              <span className="chip">{data.summary.projects_count} projects touched</span>
            </div>
            <div className="signal-list">
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Top net service</span>
                  <strong>{topService?.name_ru ?? "—"}</strong>
                </div>
                <div className="row-meta">
                  {topService
                    ? `${formatCurrency(topService.net_profit_total)} net • ${topService.net_margin_percent.toFixed(1)}% margin`
                    : "Нет активных услуг"}
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Best net margin</span>
                  <strong>{bestMarginService?.name_ru ?? "—"}</strong>
                </div>
                <div className="row-meta">
                  {bestMarginService
                    ? `${bestMarginService.net_margin_percent.toFixed(1)}% margin • ${formatCurrency(bestMarginService.net_profit_total)} net`
                    : "Нет активных услуг"}
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Monthly overhead base</span>
                  <strong>{formatCurrency(data.summary.monthly_company_overhead_total)}</strong>
                </div>
                <div className="row-meta">
                  {data.company_overhead.period_days > 0
                    ? `${data.company_overhead.period_days} days allocated • ${data.company_overhead.period_months_equivalent.toFixed(2)} month eq`
                    : "Нет периода для распределения"}
                </div>
              </div>
            </div>
          </section>
        </section>

        <div className="split-grid">
          <section className="surface">
            <div className="surface-head">
              <div>
                <h2 className="surface-title">Company Overhead</h2>
                <p className="surface-subtitle">
                  Общие постоянные расходы компании на период. Настраиваются в owner settings.
                </p>
              </div>
              <div className="surface-actions">
                <Link href="/owner/settings" className="soft-button">
                  Настроить overhead
                </Link>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Категория</th>
                  <th>Monthly</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {data.company_overhead.rows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <div className="row-title">{row.label_ru}</div>
                      <div className="row-meta">{row.description_ru}</div>
                    </td>
                    <td>{formatCurrency(row.monthly_amount)}</td>
                    <td>{formatCurrency(row.period_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="surface">
            <div className="surface-head">
              <div>
                <h2 className="surface-title">Параметры расчета</h2>
                <p className="surface-subtitle">Что именно система берет для gross и net PnL.</p>
              </div>
              <div className="surface-actions">
                <span className="chip chip-accent">{data.summary.period_label}</span>
              </div>
            </div>
            <div className="list-stack">
              <div className="list-row">
                <div className="chip chip-accent">Window</div>
                <div>
                  <div className="row-title">
                    {formatDate(data.summary.date_from)} - {formatDate(data.summary.date_to)}
                  </div>
                  <div className="row-meta">Фильтр периода для owner PnL.</div>
                </div>
                <span className="row-meta">{data.company_overhead.period_days} days</span>
              </div>
              <div className="list-row">
                <div className="chip">Gross PnL</div>
                <div>
                  <div className="row-title">Revenue - variable - service fixed</div>
                  <div className="row-meta">Материал, монтаж, блоки, addons и extra costs по позициям.</div>
                </div>
                <span className="row-meta">{formatCurrency(data.summary.estimated_profit_total)}</span>
              </div>
              <div className="list-row">
                <div className="chip chip-danger">Net PnL</div>
                <div>
                  <div className="row-title">Gross PnL - company overhead</div>
                  <div className="row-meta">Офис, fixed payroll, маркетинг, софт и прочий overhead.</div>
                </div>
                <span className="row-meta">{formatCurrency(data.summary.net_profit_total)}</span>
              </div>
            </div>
          </section>
        </div>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2 className="surface-title">PnL по услугам</h2>
              <p className="surface-subtitle">
                По каждой услуге показаны revenue, variable expenses, service fixed expenses, gross profit, allocated
                company overhead, net profit и net margin.
              </p>
            </div>
            <div className="surface-actions">
              <span className="chip chip-accent">{activeServices.length} active rows</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Услуга</th>
                  <th>Позиции</th>
                  <th>Проекты</th>
                  <th>Billable</th>
                  <th>Actual</th>
                  <th>Revenue</th>
                  <th>Variable</th>
                  <th>Fixed</th>
                  <th>Gross</th>
                  <th>Overhead</th>
                  <th>Net PnL</th>
                  <th>Net Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.service_pnl.map((service) => (
                  <tr key={service.service_type_id}>
                    <td>
                      <div className="row-title">{service.name_ru}</div>
                      <div className="row-meta">
                        Материал {formatCurrency(service.material_cost_total)} • Монтаж{" "}
                        {formatCurrency(service.installation_cost_total)} • Блоки {formatCurrency(service.block_cost_total)} •
                        Addons {formatCurrency(service.addon_cost_total)}
                      </div>
                    </td>
                    <td>{service.positions_count}</td>
                    <td>{service.projects_count}</td>
                    <td>{formatQuantity(service.billable_sqft_total)}</td>
                    <td>{formatQuantity(service.actual_film_sqft_total)}</td>
                    <td>{formatCurrency(service.revenue_total)}</td>
                    <td>{formatCurrency(service.variable_expenses_total)}</td>
                    <td>{formatCurrency(service.fixed_expenses_total)}</td>
                    <td>{formatCurrency(service.estimated_profit_total)}</td>
                    <td>{formatCurrency(service.company_overhead_allocated_total)}</td>
                    <td>{formatCurrency(service.net_profit_total)}</td>
                    <td>{service.net_margin_percent.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </OwnerShell>
  );
}
