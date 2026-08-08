import Link from "next/link";
import { redirect } from "next/navigation";

import { OwnerShell } from "@/components/owner-shell";
import { OWNER_ONLY_ROLES } from "@/features/owner/api";
import { getOwnerFinanceData } from "@/features/owner/service";
import { requireAppSession } from "@/lib/auth/app-session";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: Date | null) {
  return value ? value.toLocaleString("ru-RU") : "—";
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

export default async function OwnerFinancePage() {
  const session = await requireAppSession(OWNER_ONLY_ROLES);

  if (!session) {
    redirect("/");
  }

  const data = await getOwnerFinanceData(session);
  const paidDeposits = data.deposits.filter((deposit) => deposit.status === "paid");
  const pendingDeposits = data.deposits.filter((deposit) => deposit.status !== "paid");
  const depositReceived = paidDeposits.reduce((sum, item) => sum + item.amount, 0);
  const pendingAmount = pendingDeposits.reduce((sum, item) => sum + item.amount, 0);
  const receivablesTotal = data.receivables.reduce((sum, item) => sum + item.balance_due, 0);
  const totalProjectRevenue = data.finance_projects.reduce((sum, project) => sum + project.revenue_total, 0);
  const totalProjectProfit = data.finance_projects.reduce((sum, project) => sum + project.estimated_profit_total, 0);
  const avgProductMargin = data.product_pnl.length
    ? data.product_pnl.reduce((sum, product) => sum + product.margin_percent, 0) / data.product_pnl.length
    : 0;
  const topProduct = [...data.product_pnl].sort((a, b) => b.estimated_profit_total - a.estimated_profit_total)[0] ?? null;

  return (
    <OwnerShell
      title="Финансы"
      subtitle="Депозиты, остатки к оплате и денежное состояние проектов в одном экране."
      kicker="Управление / Финансы"
      activeHref="/owner/finance"
      actions={
        <>
          <Link href="/owner/finance/services" className="accent-button">
            PnL услуг
          </Link>
          <Link href="/owner/settings" className="soft-button">
            Прайсы и справочники
          </Link>
        </>
      }
    >
      <section className="workspace">
        <section className="workspace-hero">
          <div className="ops-hero">
            <div className="hero-command">
              <div className="hero-tag-row">
                <span className="brand-tag brand-tag-live">Finance cockpit</span>
                <span className="brand-tag">PnL</span>
                <span className="brand-tag">Receivables</span>
                {topProduct ? <span className="brand-tag">{topProduct.name_ru}</span> : null}
              </div>
              <div>
                <h2 className="hero-heading">Финансовый слой CRM</h2>
                <p className="hero-copy">
                  Полная аналитика по выручке, прибыли, продуктовым PnL и collections в фирменном техническом стиле
                  Rolan Pro.
                </p>
              </div>
              <div className="action-cluster">
                <Link href="/owner/finance/services" className="accent-button">
                  PnL услуг
                </Link>
                <Link href="/owner/projects" className="accent-button">
                  Проекты
                </Link>
                <Link href="/owner/settings" className="soft-button">
                  Прайсы
                </Link>
              </div>
              <div className="inline-stat-grid">
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Tracked revenue</span>
                  <strong className="inline-stat-value">{formatCurrency(totalProjectRevenue)}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Tracked profit</span>
                  <strong className="inline-stat-value">{formatCurrency(totalProjectProfit)}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Avg product margin</span>
                  <strong className="inline-stat-value">{avgProductMargin.toFixed(1)}%</strong>
                </div>
              </div>
            </div>

            <div className="metric-grid">
              <div className="metric-cell">
                <div className="metric-label">Deposits received</div>
                <div className="metric-value">{formatCurrency(depositReceived)}</div>
                <div className="metric-footnote">Paid deposits</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Deposits pending</div>
                <div className="metric-value">{formatCurrency(pendingAmount)}</div>
                <div className="metric-footnote">Pending deposits</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Balance due</div>
                <div className="metric-value">{formatCurrency(receivablesTotal)}</div>
                <div className="metric-footnote">Proposal total minus paid deposits</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Projects tracked</div>
                <div className="metric-value">{data.finance_projects.length}</div>
                <div className="metric-footnote">Operational money visibility</div>
              </div>
            </div>
          </div>
        </section>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2 className="surface-title">PnL по продуктам</h2>
              <p className="surface-subtitle">
                Сводный PnL по установке смарт-плёнки, защитной плёнки и солнцезащитной плёнки на базе всех project
                positions.
              </p>
            </div>
            <div className="surface-actions">
              <span className="chip chip-accent">{avgProductMargin.toFixed(1)}% avg margin</span>
            </div>
          </div>

          <div className="metric-grid">
            {data.product_pnl.map((product) => (
              <div key={product.service_code} className="metric-cell">
                <div className="metric-label">{product.name_ru}</div>
                <div className="metric-value">{formatCurrency(product.estimated_profit_total)}</div>
                <div className="metric-footnote">
                  Revenue {formatCurrency(product.revenue_total)} • Cost {formatCurrency(product.estimated_cost_total)} •
                  Margin {product.margin_percent.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>

          <table className="data-table" style={{ marginTop: 18 }}>
            <thead>
              <tr>
                <th>Продукт</th>
                <th>Позиции</th>
                <th>Проекты</th>
                <th>Billable sqft</th>
                <th>Actual sqft</th>
                <th>Revenue</th>
                <th>Cost</th>
                <th>Profit</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.product_pnl.map((product) => (
                <tr key={product.service_code}>
                  <td>
                    <div className="row-title">{product.name_ru}</div>
                    <div className="row-meta">
                      Материалы {formatCurrency(product.material_cost_total)} • Монтаж{" "}
                      {formatCurrency(product.installation_cost_total)} • Прочее {formatCurrency(product.other_costs_total)}
                    </div>
                  </td>
                  <td>{product.positions_count}</td>
                  <td>{product.projects_count}</td>
                  <td>{formatQuantity(product.billable_sqft_total)}</td>
                  <td>{formatQuantity(product.actual_film_sqft_total)}</td>
                  <td>{formatCurrency(product.revenue_total)}</td>
                  <td>{formatCurrency(product.estimated_cost_total)}</td>
                  <td>{formatCurrency(product.estimated_profit_total)}</td>
                  <td>{product.margin_percent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="split-grid">
          <section className="surface">
            <div className="surface-head">
              <div>
                <h2 className="surface-title">Deposits</h2>
              </div>
              <div className="surface-actions">
                <span className={`chip${pendingAmount > 0 ? " chip-danger" : " chip-accent"}`}>
                  {formatCurrency(pendingAmount)} pending
                </span>
              </div>
            </div>
            <div className="list-stack">
              {data.deposits.length ? (
                data.deposits.map((deposit) => (
                  <div key={deposit.deposit_id} className="list-row">
                    <div className={`chip${deposit.status === "paid" ? " chip-accent" : ""}`}>{deposit.status}</div>
                    <div>
                      <div className="row-title">{deposit.proposal.client_name}</div>
                      <div className="row-meta">
                        {deposit.proposal.title} • {formatCurrency(deposit.amount)}
                      </div>
                    </div>
                    <span className="row-meta">{formatDateTime(deposit.paid_at)}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Депозиты пока отсутствуют.</div>
              )}
            </div>
          </section>

          <section className="surface">
            <div className="surface-head">
              <div>
                <h2 className="surface-title">Receivables</h2>
              </div>
              <div className="surface-actions">
                <span className="chip">{formatCurrency(receivablesTotal)} due</span>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Клиент</th>
                  <th>Total</th>
                  <th>Deposit</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.receivables.map((item) => (
                  <tr key={item.proposal_id}>
                    <td>
                      <div className="row-title">{item.title}</div>
                      <div className="row-meta mono">{item.proposal_code ?? item.proposal_id}</div>
                    </td>
                    <td>{item.client_name}</td>
                    <td>{formatCurrency(item.total)}</td>
                    <td>{formatCurrency(item.deposit_received)}</td>
                    <td>{formatCurrency(item.balance_due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2 className="surface-title">Projects money snapshot</h2>
            </div>
            <div className="surface-actions">
              <span className="chip chip-accent">{formatCurrency(totalProjectProfit)} profit</span>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Клиент</th>
                <th>Status</th>
                <th>Revenue</th>
                <th>Profit</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.finance_projects.map((project) => (
                <tr key={project.project_id}>
                  <td>
                    <Link href={`/manager/projects/${project.project_id}`} className="row-title">
                      {project.title}
                    </Link>
                    <div className="row-meta mono">{project.project_code ?? project.project_id}</div>
                  </td>
                  <td>{project.client_name}</td>
                  <td>{project.project_status}</td>
                  <td>{formatCurrency(project.revenue_total)}</td>
                  <td>{formatCurrency(project.estimated_profit_total)}</td>
                  <td>{project.margin_percent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </OwnerShell>
  );
}
