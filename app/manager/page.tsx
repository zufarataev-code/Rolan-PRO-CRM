import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { getManagerDashboardData } from "@/features/sales/server-api";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Без срока";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Без срока" : date.toLocaleString("ru-RU");
}

function isOverdue(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function clampPercent(value: number, min = 6) {
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

export default async function ManagerDashboardPage() {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const { dashboard, deals, followUps, tasks } = await getManagerDashboardData();
  const openTasks = tasks.filter((item) => item.status !== "done" && item.status !== "canceled");
  const overdueFollowUps = followUps.filter((item) => item.is_overdue).length;
  const overdueTasks = openTasks.filter((item) => item.is_overdue).length;
  const attentionDeals = deals.filter((deal) => deal.status_flags?.needs_attention).length;
  const pipelineValue = deals.reduce((sum, deal) => sum + deal.estimated_value, 0);
  const cashReadyDeals = deals.filter((deal) =>
    ["APPROVED", "DEPOSIT_PENDING", "FINAL_PAYMENT_PENDING"].includes(deal.pipeline_status.status_code),
  ).length;
  const urgentTasks = openTasks.filter((item) => item.priority === "high").length;

  const kpis = [
    { label: "Новые лиды", value: dashboard.kpis.new_leads, note: "На текущем менеджере" },
    { label: "Follow Ups на сегодня", value: dashboard.kpis.follow_ups_today, note: "Из реального CRM" },
    { label: "Консультации сегодня", value: dashboard.kpis.consultations_today, note: "По календарю" },
    { label: "Proposal в работе", value: dashboard.kpis.proposals_pending, note: "Draft / sent / updated" },
    { label: "Депозиты в ожидании", value: dashboard.kpis.deposits_pending, note: "До handoff в project" },
    { label: "Ждут scheduling", value: dashboard.kpis.projects_waiting_schedule, note: "После project creation" },
    { label: "Проекты в работе", value: dashboard.kpis.projects_in_progress, note: "Operations read-only here" },
    { label: "Финальный платеж", value: dashboard.kpis.final_payments_pending, note: "Ожидает закрытия" },
  ];

  const pressureSignals = [
    {
      label: "Просроченные follow-ups",
      value: overdueFollowUps,
      tone: overdueFollowUps > 0 ? "danger" : "accent",
      width: clampPercent(overdueFollowUps * 22),
    },
    {
      label: "Просроченные задачи",
      value: overdueTasks,
      tone: overdueTasks > 0 ? "danger" : "accent",
      width: clampPercent(overdueTasks * 24),
    },
    {
      label: "Сделки c attention",
      value: attentionDeals,
      tone: attentionDeals > 0 ? "warning" : "accent",
      width: clampPercent(deals.length ? (attentionDeals / deals.length) * 100 : 0),
    },
  ];

  const pipelineSignals = [
    {
      label: "Cash-ready deals",
      value: cashReadyDeals,
      tone: "success",
      width: clampPercent(deals.length ? (cashReadyDeals / deals.length) * 100 : 0),
    },
    {
      label: "Proposal load",
      value: dashboard.kpis.proposals_pending,
      tone: "accent",
      width: clampPercent(dashboard.kpis.proposals_pending * 14),
    },
    {
      label: "Urgent tasks",
      value: urgentTasks,
      tone: urgentTasks > 0 ? "warning" : "accent",
      width: clampPercent(urgentTasks * 24),
    },
  ];

  const executionSignals = [
    {
      label: "Ждут scheduling",
      value: dashboard.kpis.projects_waiting_schedule,
      tone: dashboard.kpis.projects_waiting_schedule > 0 ? "warning" : "success",
      width: clampPercent(dashboard.kpis.projects_waiting_schedule * 20),
    },
    {
      label: "Проекты в работе",
      value: dashboard.kpis.projects_in_progress,
      tone: "success",
      width: clampPercent(dashboard.kpis.projects_in_progress * 18),
    },
    {
      label: "Final payment",
      value: dashboard.kpis.final_payments_pending,
      tone: dashboard.kpis.final_payments_pending > 0 ? "accent" : "success",
      width: clampPercent(dashboard.kpis.final_payments_pending * 18),
    },
  ];

  const agendaItems = [
    ...followUps.slice(0, 4).map((item) => ({
      id: item.follow_up_id,
      rawDueAt: item.due_at,
      time: formatDateTime(item.due_at),
      title: `Follow-up · ${item.type_key}`,
      meta: item.notes || item.assigned_to?.full_name || "Без деталей",
    })),
    ...tasks
      .filter((item) => item.status !== "done" && item.status !== "canceled")
      .slice(0, 4)
      .map((item) => ({
        id: item.task_id,
        rawDueAt: item.due_at,
        time: formatDateTime(item.due_at),
        title: `Task · ${item.title}`,
        meta: item.description || item.assigned_to?.full_name || "Без описания",
      })),
  ].slice(0, 6);

  const focusDeals = deals.slice(0, 4);
  const managerNextActions: SmartAction[] = [];

  if (overdueFollowUps > 0) {
    managerNextActions.push({
      label: "Вернуть просроченные follow-ups",
      description: "Сначала клиенты, где CRM уже считает контакт просроченным.",
      value: String(overdueFollowUps),
      href: "/manager/crm/pipeline",
      chipClassName: "chip chip-danger",
    });
  }

  if (overdueTasks > 0) {
    managerNextActions.push({
      label: "Закрыть просроченные задачи",
      description: "Открытые tasks тормозят сделки, проекты или коммуникации.",
      value: String(overdueTasks),
      href: "/notifications",
      chipClassName: "chip chip-danger",
    });
  }

  if (attentionDeals > 0) {
    managerNextActions.push({
      label: "Разобрать сделки с attention",
      description: "Эти сделки требуют ручного решения, следующего шага или обновления статуса.",
      value: String(attentionDeals),
      href: "/manager/crm/pipeline",
      chipClassName: "chip chip-danger",
    });
  }

  if (dashboard.kpis.deposits_pending > 0) {
    managerNextActions.push({
      label: "Дожать pending deposits",
      description: "Proposal уже близко к деньгам. Проверить оплату и handoff в project.",
      value: String(dashboard.kpis.deposits_pending),
      href: "/manager/crm/proposals",
      chipClassName: "chip chip-accent",
    });
  }

  if (dashboard.kpis.projects_waiting_schedule > 0) {
    managerNextActions.push({
      label: "Передать проекты в scheduling",
      description: "После продажи важно быстро назначить crew и дату монтажа.",
      value: String(dashboard.kpis.projects_waiting_schedule),
      href: "/manager/projects",
      chipClassName: "chip",
    });
  }

  if (urgentTasks > 0) {
    managerNextActions.push({
      label: "Проверить urgent tasks",
      description: "High-priority задачи идут отдельным сигналом, даже если срок еще не просрочен.",
      value: String(urgentTasks),
      href: "/notifications",
      chipClassName: "chip",
    });
  }

  if (!managerNextActions.length) {
    managerNextActions.push({
      label: "Система чистая",
      description: "Критических sales-сигналов нет. Можно усиливать pipeline и создавать новые лиды.",
      value: "OK",
      href: "/manager/crm/leads#new-lead",
      chipClassName: "chip chip-success",
    });
  }

  return (
    <ManagerShell
      title="Менеджерский CRM дашборд"
      subtitle="Живой sales overview по лидам, follow ups, консультациям, proposal и деньгам в воронке."
      kicker="Управление продажами"
      activeHref="/manager"
      actions={
        <>
          <Link href="/manager/crm/pipeline" className="soft-button">
            Открыть воронку
          </Link>
          <Link href="/manager/crm/leads#new-lead" className="accent-button">
            Создать лид
          </Link>
        </>
      }
    >
      <section className="workspace">
        <div className="workspace-hero">
          <div className="ops-hero">
            <div className="hero-command">
              <div className="hero-tag-row">
                <span className="brand-tag brand-tag-live">ROLANPRO CRM</span>
                <span className="brand-tag">Active buttons</span>
                <span className="brand-tag">Live analytics</span>
                <span className={`brand-tag${attentionDeals > 0 ? " brand-tag-hot" : ""}`}>
                  {attentionDeals} attention
                </span>
              </div>
              <div>
                <h2 className="hero-heading">Менеджерский command center</h2>
                <p className="hero-copy">
                  Живой CRM-поток по лидам, follow-ups, проектам и деньгам. Все ключевые действия, теги и индикаторы
                  собраны на одном экране.
                </p>
              </div>
              <div className="action-cluster">
                <Link href="/manager/crm/leads" className="accent-button">
                  Лиды
                </Link>
                <Link href="/manager/crm/consultations" className="soft-button">
                  Консультации
                </Link>
                <Link href="/manager/projects" className="soft-button">
                  Проекты
                </Link>
                <Link href="/manager/crm/proposals" className="soft-button">
                  Proposal
                </Link>
              </div>
              <div className="inline-stat-grid">
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Pipeline value</span>
                  <strong className="inline-stat-value">{formatCurrency(pipelineValue)}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Open tasks</span>
                  <strong className="inline-stat-value">{openTasks.length}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Overdue</span>
                  <strong className="inline-stat-value">{overdueFollowUps + overdueTasks}</strong>
                </div>
              </div>
            </div>

            <div className="metric-grid">
              {kpis.map((item) => (
                <div key={item.label} className="metric-cell">
                  <div className="metric-label">{item.label}</div>
                  <div className="metric-value">{item.value}</div>
                  <div className="metric-footnote">{item.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="kpi-ribbon">
            <div className="kpi-pill">
              <span>Активных сделок</span>
              <strong>{deals.length}</strong>
            </div>
            <div className="kpi-pill">
              <span>Открытых задач</span>
              <strong>{tasks.filter((item) => item.status !== "done" && item.status !== "canceled").length}</strong>
            </div>
            <div className="kpi-pill">
              <span>Назначенных follow-ups</span>
              <strong>{followUps.length}</strong>
            </div>
          </div>
        </div>

        <section className="analytics-grid">
          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h2 className="surface-title">Pipeline pressure</h2>
                <p className="surface-subtitle">Где менеджер теряет темп и где нужен быстрый follow-through.</p>
              </div>
              <span className={`chip${overdueFollowUps + overdueTasks > 0 ? " chip-danger" : " chip-accent"}`}>
                {overdueFollowUps + overdueTasks} overdue
              </span>
            </div>
            <div className="signal-list">
              {pressureSignals.map((signal) => (
                <div key={signal.label} className="signal-row">
                  <div className="signal-row-top">
                    <span>{signal.label}</span>
                    <strong>{signal.value}</strong>
                  </div>
                  <div className="signal-bar">
                    <div className={`signal-bar-fill signal-bar-fill-${signal.tone}`} style={{ width: `${signal.width}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h2 className="surface-title">Revenue readiness</h2>
                <p className="surface-subtitle">Сколько объема уже близко к деньгам и сколько еще в разогреве.</p>
              </div>
              <span className="chip chip-accent">{formatCurrency(pipelineValue)}</span>
            </div>
            <div className="signal-list">
              {pipelineSignals.map((signal) => (
                <div key={signal.label} className="signal-row">
                  <div className="signal-row-top">
                    <span>{signal.label}</span>
                    <strong>{signal.value}</strong>
                  </div>
                  <div className="signal-bar">
                    <div className={`signal-bar-fill signal-bar-fill-${signal.tone}`} style={{ width: `${signal.width}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h2 className="surface-title">Execution lane</h2>
                <p className="surface-subtitle">Переход от approved sales в назначенный и оплаченный runtime.</p>
              </div>
              <span className="chip">{dashboard.kpis.projects_in_progress} live installs</span>
            </div>
            <div className="signal-list">
              {executionSignals.map((signal) => (
                <div key={signal.label} className="signal-row">
                  <div className="signal-row-top">
                    <span>{signal.label}</span>
                    <strong>{signal.value}</strong>
                  </div>
                  <div className="signal-bar">
                    <div className={`signal-bar-fill signal-bar-fill-${signal.tone}`} style={{ width: `${signal.width}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2 className="surface-title">Manager next actions</h2>
              <p className="surface-subtitle">
                Очередь действий на сегодня: просрочки, сделки, депозиты, scheduling и urgent tasks.
              </p>
            </div>
            <div className="surface-actions">
              <span className={`chip${managerNextActions.some((item) => item.chipClassName.includes("danger")) ? " chip-danger" : " chip-accent"}`}>
                Smart queue
              </span>
            </div>
          </div>
          <div className="list-stack">
            {managerNextActions.slice(0, 6).map((action) => (
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
                <h2 className="surface-title">Сегодняшний план</h2>
                <p className="surface-subtitle">Follow-ups и задачи менеджера из реального CRM.</p>
              </div>
              <div className="surface-actions">
                <Link href="/manager/calendar" className="soft-button">
                  Открыть график
                </Link>
              </div>
            </div>
            <div className="list-stack">
              {agendaItems.length ? (
                agendaItems.map((item) => (
                  <div key={item.id} className="list-row">
                    <div className="row-time">{item.time}</div>
                    <div>
                      <div className="row-title">{item.title}</div>
                      <div className="row-meta">{item.meta}</div>
                    </div>
                    <span className={`chip${isOverdue(item.rawDueAt) ? " chip-danger" : ""}`}>
                      {isOverdue(item.rawDueAt) ? "overdue" : "Открыть"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">На сегодня нет активных follow-ups или задач.</div>
              )}
            </div>
          </section>

          <section className="surface">
            <div className="surface-head">
              <div>
                <h2 className="surface-title">Фокус по сделкам</h2>
                <p className="surface-subtitle">Текущие сделки и их stage без mock-слоя.</p>
              </div>
              <div className="surface-actions">
                <Link href="/manager/crm/pipeline" className="soft-button">
                  Вся воронка
                </Link>
              </div>
            </div>
            <div className="list-stack">
              {focusDeals.length ? (
                focusDeals.map((deal) => (
                  <Link key={deal.deal_id} href={`/manager/crm/deals/${deal.deal_id}`} className="list-row">
                    <div className="chip chip-accent">{deal.pipeline_status.name_ru}</div>
                    <div>
                      <div className="row-title">{deal.title}</div>
                      <div className="row-meta">
                        {deal.deal_code} · {formatCurrency(deal.estimated_value)}
                      </div>
                    </div>
                    <div className="project-inline-chips">
                      <span className="chip">{deal.next_follow_up ? "Есть next step" : "Без follow-up"}</span>
                      {deal.status_flags?.is_new ? <span className="chip chip-accent">new</span> : null}
                      {deal.status_flags?.needs_attention ? <span className="chip chip-danger">attention</span> : null}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="empty-state">Сделки пока не найдены.</div>
              )}
            </div>
          </section>
        </div>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2 className="surface-title">Live Rail</h2>
              <p className="surface-subtitle">Последние sales-события из activity log.</p>
            </div>
            <div className="surface-actions">
              <span className="chip chip-success">Realtime</span>
            </div>
          </div>
          <div className="list-stack">
            {dashboard.recent_activity.length ? (
              dashboard.recent_activity.map((item) => (
                <div key={item.activity_id} className="list-row">
                  <div className="chip chip-success">Live</div>
                  <div className="row-title">{item.message}</div>
                  <span className="row-meta">{formatDateTime(item.created_at)}</span>
                </div>
              ))
            ) : (
              <div className="empty-state">Недавних событий пока нет.</div>
            )}
          </div>
        </section>
      </section>
    </ManagerShell>
  );
}
