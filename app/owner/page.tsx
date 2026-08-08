import Link from "next/link";
import { redirect } from "next/navigation";

import { OwnerShell } from "@/components/owner-shell";
import { getOwnerDashboardData } from "@/features/owner/service";
import { OWNER_ONLY_ROLES } from "@/features/owner/api";
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

function clampPercent(value: number, min = 8) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(100, Math.round(value)));
}

type SmartAction = {
  label: string;
  description: string;
  value: string;
  href: string;
  chipClassName: string;
};

export default async function OwnerDashboardPage() {
  const session = await requireAppSession(OWNER_ONLY_ROLES);

  if (!session) {
    redirect("/");
  }

  const data = await getOwnerDashboardData(session);
  const cashCapture =
    data.metrics.total_sales_value > 0
      ? (data.metrics.deposits_received / data.metrics.total_sales_value) * 100
      : 0;
  const operationsLoad =
    data.metrics.problem_projects + data.metrics.low_margin_projects + data.metrics.waiting_schedule;
  const overdueActions = data.metrics.overdue_follow_ups + data.metrics.overdue_tasks;

  const metrics = [
    { label: "Leads", value: data.metrics.leads_count, note: "Все лиды в системе" },
    { label: "Deals", value: data.metrics.deals_count, note: "Все сделки в pipeline" },
    { label: "Sales total", value: formatCurrency(data.metrics.total_sales_value), note: "Proposal total snapshot" },
    { label: "Deposits received", value: formatCurrency(data.metrics.deposits_received), note: "Paid deposits" },
    { label: "Unpaid balance", value: formatCurrency(data.metrics.unpaid_balance), note: "Proposal minus paid deposit" },
    { label: "Waiting schedule", value: data.metrics.waiting_schedule, note: "Проекты без назначенного монтажа" },
    { label: "In progress", value: data.metrics.in_progress_projects, note: "Активные проекты" },
    { label: "Low margin", value: data.metrics.low_margin_projects, note: "Margin ниже 25%" },
    { label: "Problems", value: data.metrics.problem_projects, note: "Problem / overdue / attention" },
    { label: "Overdue actions", value: data.metrics.overdue_follow_ups + data.metrics.overdue_tasks, note: "Просроченные follow-ups и tasks" },
  ];

  const ownerNextActions: SmartAction[] = [];

  if (overdueActions > 0) {
    ownerNextActions.push({
      label: "Закрыть просроченные действия",
      description: "Follow-ups и tasks уже вышли за срок. Сначала вернуть контроль по людям и обещаниям.",
      value: String(overdueActions),
      href: "/notifications",
      chipClassName: "chip chip-danger",
    });
  }

  if (data.metrics.waiting_schedule > 0) {
    ownerNextActions.push({
      label: "Назначить монтажи",
      description: "Проекты после продажи ждут crew, даты или финального scheduling.",
      value: String(data.metrics.waiting_schedule),
      href: "/owner/projects",
      chipClassName: "chip chip-danger",
    });
  }

  if (data.metrics.problem_projects > 0) {
    ownerNextActions.push({
      label: "Разобрать проблемные проекты",
      description: "Есть проекты с problem, overdue или attention-флагами. Нужен owner-review.",
      value: String(data.metrics.problem_projects),
      href: "/owner/projects",
      chipClassName: "chip chip-danger",
    });
  }

  if (data.metrics.low_margin_projects > 0) {
    ownerNextActions.push({
      label: "Проверить маржу",
      description: "Низкая маржа может съесть прибыль. Сверить материалы, labor и скидки.",
      value: String(data.metrics.low_margin_projects),
      href: "/owner/finance",
      chipClassName: "chip",
    });
  }

  if (data.metrics.unpaid_balance > 0) {
    ownerNextActions.push({
      label: "Добрать unpaid balance",
      description: "Деньги уже в pipeline, но еще не собраны. Проверить deposit и final payment.",
      value: formatCurrency(data.metrics.unpaid_balance),
      href: "/owner/finance",
      chipClassName: "chip chip-accent",
    });
  }

  if (!ownerNextActions.length) {
    ownerNextActions.push({
      label: "Система под контролем",
      description: "Критических owner-сигналов нет. Можно смотреть рост, PnL услуг и новые возможности.",
      value: "OK",
      href: "/owner/finance/services",
      chipClassName: "chip chip-success",
    });
  }

  return (
    <OwnerShell
      title="Панель владельца"
      subtitle="Деньги, проблемные проекты, загрузка команды и ключевые показатели компании."
      kicker="Управление / Обзор"
      activeHref="/owner"
      actions={
        <>
          <Link href="/owner/finance" className="soft-button">
            Открыть финансы
          </Link>
          <Link href="/owner/settings" className="accent-button">
            Справочники и прайсы
          </Link>
        </>
      }
    >
      <section className="workspace">
        <section className="workspace-hero">
          <div className="ops-hero">
            <div className="hero-command">
              <div className="hero-tag-row">
                <span className="brand-tag brand-tag-live">Owner control</span>
                <span className="brand-tag">Cash</span>
                <span className="brand-tag">Risk map</span>
                <span className={`brand-tag${operationsLoad > 0 ? " brand-tag-hot" : ""}`}>
                  {operationsLoad} active signals
                </span>
              </div>
              <div>
                <h2 className="hero-heading">Owner control layer</h2>
                <p className="hero-copy">
                  Деньги, margin, проблемные проекты, загрузка и системные сигналы сведены в один owner-уровень с
                  быстрыми переходами по CRM.
                </p>
              </div>
              <div className="action-cluster">
                <Link href="/owner/finance" className="accent-button">
                  Финансы
                </Link>
                <Link href="/owner/projects" className="soft-button">
                  Проекты
                </Link>
                <Link href="/owner/settings" className="soft-button">
                  Справочники
                </Link>
              </div>
              <div className="inline-stat-grid">
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Cash capture</span>
                  <strong className="inline-stat-value">{cashCapture.toFixed(0)}%</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Problems</span>
                  <strong className="inline-stat-value">{data.metrics.problem_projects}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Low margin</span>
                  <strong className="inline-stat-value">{data.metrics.low_margin_projects}</strong>
                </div>
              </div>
            </div>

            <div className="metric-grid">
              {metrics.map((item) => (
                <div key={item.label} className="metric-cell">
                  <div className="metric-label">{item.label}</div>
                  <div className="metric-value">{item.value}</div>
                  <div className="metric-footnote">{item.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="analytics-grid">
          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h2 className="surface-title">Cash analytics</h2>
                <p className="surface-subtitle">Сколько продаж уже конвертировалось в депозиты и сколько еще на столе.</p>
              </div>
              <span className="chip chip-accent">{cashCapture.toFixed(0)}% captured</span>
            </div>
            <div className="signal-list">
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Sales total</span>
                  <strong>{formatCurrency(data.metrics.total_sales_value)}</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-accent" style={{ width: `${clampPercent(data.metrics.total_sales_value / 600)}%` }} />
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Deposits received</span>
                  <strong>{formatCurrency(data.metrics.deposits_received)}</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-success" style={{ width: `${clampPercent(cashCapture)}%` }} />
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Unpaid balance</span>
                  <strong>{formatCurrency(data.metrics.unpaid_balance)}</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-warning" style={{ width: `${clampPercent(data.metrics.unpaid_balance / 500)}%` }} />
                </div>
              </div>
            </div>
          </section>

          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h2 className="surface-title">Risk analytics</h2>
                <p className="surface-subtitle">Комбинация проблемных, низкомаржинальных и ждущих назначения проектов.</p>
              </div>
              <span className={`chip${operationsLoad > 0 ? " chip-danger" : " chip-accent"}`}>{operationsLoad} signals</span>
            </div>
            <div className="signal-list">
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Problem projects</span>
                  <strong>{data.metrics.problem_projects}</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-danger" style={{ width: `${clampPercent(data.metrics.problem_projects * 22)}%` }} />
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Low margin</span>
                  <strong>{data.metrics.low_margin_projects}</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-warning" style={{ width: `${clampPercent(data.metrics.low_margin_projects * 22)}%` }} />
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Waiting schedule</span>
                  <strong>{data.metrics.waiting_schedule}</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-accent" style={{ width: `${clampPercent(data.metrics.waiting_schedule * 22)}%` }} />
                </div>
              </div>
            </div>
          </section>
        </section>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2 className="surface-title">Owner next actions</h2>
              <p className="surface-subtitle">
                Умная очередь: CRM сама поднимает деньги, риски, монтажи и просрочки в правильном порядке.
              </p>
            </div>
            <div className="surface-actions">
              <span className={`chip${ownerNextActions.some((item) => item.chipClassName.includes("danger")) ? " chip-danger" : " chip-accent"}`}>
                Priority queue
              </span>
            </div>
          </div>
          <div className="list-stack">
            {ownerNextActions.slice(0, 5).map((action) => (
              <Link key={action.label} href={action.href} className="list-row">
                <span className={action.chipClassName}>{action.value}</span>
                <div>
                  <div className="row-title">{action.label}</div>
                  <div className="row-meta">{action.description}</div>
                </div>
                <span className="row-meta">Открыть</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="split-grid">
          <section className="surface">
            <div className="surface-head">
              <div>
                <h2 className="surface-title">Проблемные / рискованные проекты</h2>
                <p className="surface-subtitle">
                  Проекты с problem flag, overdue или низкой маржой по текущему runtime snapshot.
                </p>
              </div>
              <div className="surface-actions">
                <Link href="/owner/projects" className="soft-button">
                  Весь портфель
                </Link>
              </div>
            </div>
            <div className="list-stack">
              {data.attention_projects.length ? (
                data.attention_projects.map((project) => (
                  <Link key={project.project_id} href={`/manager/projects/${project.project_id}`} className="list-row">
                    <div className="chip chip-danger">{project.project_status.name_ru}</div>
                    <div>
                      <div className="row-title">{project.title}</div>
                      <div className="row-meta">
                        {project.client?.name ?? "Без клиента"} • margin {project.finance_snapshot.margin_percent.toFixed(1)}%
                      </div>
                    </div>
                    <span className="row-meta">{project.schedule?.crew ?? "Schedule TBD"}</span>
                  </Link>
                ))
              ) : (
                <div className="empty-state">Рискованных проектов сейчас нет.</div>
              )}
            </div>
          </section>

          <section className="surface">
            <div className="surface-head">
              <div>
                <h2 className="surface-title">Последние депозиты</h2>
                <p className="surface-subtitle">Paid / pending deposits как денежный пульс компании.</p>
              </div>
              <div className="surface-actions">
                <Link href="/owner/finance" className="soft-button">
                  Cash view
                </Link>
              </div>
            </div>
            <div className="list-stack">
              {data.recent_deposits.length ? (
                data.recent_deposits.slice(0, 6).map((deposit) => (
                  <div key={deposit.deposit_id} className="list-row">
                    <div className={`chip${deposit.status === "paid" ? " chip-accent" : ""}`}>{deposit.status}</div>
                    <div>
                      <div className="row-title">{deposit.proposal.client?.name ?? "Без клиента"}</div>
                      <div className="row-meta">
                        {deposit.proposal.title} • {formatCurrency(Number(deposit.amount))}
                      </div>
                    </div>
                    <span className="row-meta">{formatDateTime(deposit.paid_at ?? null)}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Депозиты пока не найдены.</div>
              )}
            </div>
          </section>
        </div>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2 className="surface-title">Последние предложения и cash conversion</h2>
              <p className="surface-subtitle">Owner-level view: proposal, deposit, project linkage.</p>
            </div>
            <div className="surface-actions">
              <span className="chip chip-accent">Owner analytics</span>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Proposal</th>
                <th>Клиент</th>
                <th>Status</th>
                <th>Total</th>
                <th>Deposit</th>
                <th>Project</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_proposals.map((proposal) => (
                <tr key={proposal.proposal_id}>
                  <td>
                    <div className="row-title">{proposal.title}</div>
                    <div className="row-meta mono">{proposal.proposal_code ?? proposal.proposal_id}</div>
                  </td>
                  <td>{proposal.client?.name ?? "—"}</td>
                  <td>{proposal.status}</td>
                  <td>{formatCurrency(proposal.selected_total_amount)}</td>
                  <td>
                    {proposal.deposit
                      ? `${proposal.deposit.status} · ${formatCurrency(proposal.deposit.amount)}`
                      : "Нет deposit"}
                  </td>
                  <td>{proposal.project?.project_code ?? "Project еще не создан"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </OwnerShell>
  );
}
