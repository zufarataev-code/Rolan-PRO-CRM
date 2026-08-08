import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { listProjectsForSession } from "@/features/projects/service";
import { requireAppSession } from "@/lib/auth/app-session";

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString("ru-RU") : "Без даты";
}

function formatTimeRange(start: Date | null, end: Date | null) {
  if (!start || !end) {
    return "Время не задано";
  }

  return `${start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString(
    "ru-RU",
    { hour: "2-digit", minute: "2-digit" },
  )}`;
}

function clampPercent(value: number, min = 8) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(100, Math.round(value)));
}

function getProjectHealth(project: Awaited<ReturnType<typeof listProjectsForSession>>[number]) {
  let score = 100;

  if (!project.schedule) {
    score -= 18;
  }

  if (project.problem_flag) {
    score -= 30;
  }

  if (project.status_flags.is_overdue) {
    score -= 24;
  }

  if (project.finance_snapshot.margin_percent < 25) {
    score -= 20;
  }

  return Math.max(12, Math.min(100, Math.round(score)));
}

export default async function ProjectsPage() {
  const session = await requireAppSession(PROJECT_ACCESS_ROLES);

  if (!session) {
    redirect("/");
  }

  const projects = await listProjectsForSession(session);
  const metrics = {
    total: projects.length,
    in_progress: projects.filter((project) => project.project_status.status_code === "IN_PROGRESS").length,
    scheduled: projects.filter((project) => project.project_status.status_code === "SCHEDULED").length,
    flagged: projects.filter((project) => project.problem_flag).length,
  };
  const totalRevenue = projects.reduce((sum, project) => sum + project.finance_snapshot.revenue_total, 0);
  const totalProfit = projects.reduce((sum, project) => sum + project.finance_snapshot.estimated_profit_total, 0);
  const avgMargin = projects.length
    ? projects.reduce((sum, project) => sum + project.finance_snapshot.margin_percent, 0) / projects.length
    : 0;
  const scheduledCoverage = projects.length
    ? (projects.filter((project) => project.schedule).length / projects.length) * 100
    : 0;

  return (
    <ManagerShell
      title="Проекты"
      subtitle="Все проекты, исполнители, даты работ, услуги, документы и текущий статус."
      kicker="Работа / Проекты"
      activeHref="/manager/projects"
      actions={
        <>
          <div className="chip chip-accent">{projects.length} projects</div>
          <Link href="/manager/projects/new" className="accent-button">
            Создать проект
          </Link>
          <Link href="/manager/crm/proposals" className="soft-button">
            Из proposal в проект
          </Link>
        </>
      }
    >
      <section className="workspace">
        <section className="workspace-hero">
          <div className="ops-hero">
            <div className="hero-command">
              <div className="hero-tag-row">
                <span className="brand-tag brand-tag-live">Projects</span>
                <span className="brand-tag">Scheduling</span>
                <span className="brand-tag">Finance linked</span>
                <span className={`brand-tag${metrics.flagged > 0 ? " brand-tag-hot" : ""}`}>
                  {metrics.flagged} flagged
                </span>
              </div>
              <div>
                <h2 className="hero-heading">Операционная лента проектов</h2>
                <p className="hero-copy">
                  Все монтажи, crew, теги риска, документы и финансовые индикаторы собраны в одном динамичном рабочем
                  слое.
                </p>
              </div>
              <div className="action-cluster">
                <Link href="/manager/projects/new" className="accent-button">
                  Новый проект
                </Link>
                <Link href="/manager/calendar" className="accent-button">
                  Scheduling
                </Link>
                <Link href="/manager/crm/proposals" className="soft-button">
                  Proposal handoff
                </Link>
                <Link href="/manager/crm/calculator" className="soft-button">
                  Калькулятор
                </Link>
              </div>
              <div className="inline-stat-grid">
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Revenue stack</span>
                  <strong className="inline-stat-value">{formatMoney(totalRevenue)}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Profit stack</span>
                  <strong className="inline-stat-value">{formatMoney(totalProfit)}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Schedule coverage</span>
                  <strong className="inline-stat-value">{scheduledCoverage.toFixed(0)}%</strong>
                </div>
              </div>
            </div>

            <div className="metric-grid">
              <div className="metric-cell">
                <div className="metric-label">Всего проектов</div>
                <div className="metric-value">{metrics.total}</div>
                <div className="metric-footnote">Открытые operational cards</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">В работе</div>
                <div className="metric-value">{metrics.in_progress}</div>
                <div className="metric-footnote">Активные installs</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Запланированы</div>
                <div className="metric-value">{metrics.scheduled}</div>
                <div className="metric-footnote">С подтвержденным окном</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Проблемные</div>
                <div className="metric-value">{metrics.flagged}</div>
                <div className="metric-footnote">Problem flag / access issues</div>
              </div>
            </div>
          </div>
        </section>

        <section className="analytics-grid">
          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h2 className="surface-title">Schedule signal</h2>
                <p className="surface-subtitle">Показывает покрытие crew и install window по всему портфелю.</p>
              </div>
              <span className="chip chip-accent">{scheduledCoverage.toFixed(0)}% ready</span>
            </div>
            <div className="signal-list">
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Schedule coverage</span>
                  <strong>{scheduledCoverage.toFixed(0)}%</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-success" style={{ width: `${clampPercent(scheduledCoverage)}%` }} />
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>In progress load</span>
                  <strong>{metrics.in_progress}</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-accent" style={{ width: `${clampPercent(metrics.in_progress * 22)}%` }} />
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Flagged projects</span>
                  <strong>{metrics.flagged}</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-danger" style={{ width: `${clampPercent(metrics.flagged * 26)}%` }} />
                </div>
              </div>
            </div>
          </section>

          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h2 className="surface-title">Finance signal</h2>
                <p className="surface-subtitle">Выручка, прибыль и средняя маржа по operational портфелю.</p>
              </div>
              <span className="chip">{avgMargin.toFixed(1)}% avg margin</span>
            </div>
            <div className="signal-list">
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Total revenue</span>
                  <strong>{formatMoney(totalRevenue)}</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-accent" style={{ width: `${clampPercent(totalRevenue / 400)}%` }} />
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Total profit</span>
                  <strong>{formatMoney(totalProfit)}</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-success" style={{ width: `${clampPercent(totalProfit / 180)}%` }} />
                </div>
              </div>
              <div className="signal-row">
                <div className="signal-row-top">
                  <span>Average margin</span>
                  <strong>{avgMargin.toFixed(1)}%</strong>
                </div>
                <div className="signal-bar">
                  <div className="signal-bar-fill signal-bar-fill-warning" style={{ width: `${clampPercent(avgMargin)}%` }} />
                </div>
              </div>
            </div>
          </section>
        </section>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2 className="surface-title">Projects stream</h2>
              <p className="surface-subtitle">
                Главный operational вход: клиент, services, crew, schedule, active tags и финансовые индикаторы.
              </p>
            </div>
            <div className="surface-actions">
              <span className="chip chip-accent">{projects.length} cards</span>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="empty-state">Проекты пока не созданы.</div>
          ) : (
            <div className="project-stream">
              {projects.map((project) => {
                const health = getProjectHealth(project);

                return (
                  <article key={project.project_id} className="project-stream-card">
                    <div className="project-stream-top">
                      <div>
                        <div className="page-kicker mono">{project.project_code ?? project.project_id}</div>
                        <h3 className="stream-title">
                          <Link href={`/manager/projects/${project.project_id}`}>{project.title}</Link>
                        </h3>
                        <div className="project-inline-chips">
                          <span className="chip">{project.project_status.name_ru}</span>
                          {project.payment_status ? <span className="chip">{project.payment_status.name_ru}</span> : null}
                          <span className={`chip${project.problem_flag ? " chip-danger" : " chip-accent"}`}>
                            {project.problem_flag ? "Problem" : project.priority}
                          </span>
                          {project.status_flags?.is_new ? <span className="chip chip-accent">new</span> : null}
                          {project.status_flags?.is_overdue ? <span className="chip chip-danger">overdue</span> : null}
                          {project.status_flags?.needs_attention ? <span className="chip">attention</span> : null}
                        </div>
                      </div>

                      <div className="surface-actions">
                        <Link href={`/manager/projects/${project.project_id}`} className="accent-button">
                          Открыть проект
                        </Link>
                      </div>
                    </div>

                    <div className="project-stream-body">
                      <div className="project-stream-section">
                        <div className="stream-label">Клиент и объект</div>
                        <div className="row-title">{project.client?.name ?? "Без клиента"}</div>
                        <div className="row-meta">
                          {project.city?.name_ru ?? "Без города"} • {project.address ?? "Адрес не указан"}
                        </div>
                        <div className="row-meta">{project.service_summary || "Без позиций"}</div>
                      </div>

                      <div className="project-stream-section">
                        <div className="stream-label">Монтаж и crew</div>
                        <div className="row-title">{project.lead_installer?.full_name ?? "Lead не назначен"}</div>
                        <div className="row-meta">{project.helpers_count} helpers / crew</div>
                        <div className="row-meta">{formatDate(project.install_date)}</div>
                        <div className="row-meta">{formatTimeRange(project.start_time, project.end_time)}</div>
                        <div className="row-meta">{project.schedule?.crew ?? "Crew TBD"}</div>
                      </div>

                      <div className="project-stream-section">
                        <div className="stream-label">Индикаторы</div>
                        <div className="signal-row">
                          <div className="signal-row-top">
                            <span>Health</span>
                            <strong>{health}%</strong>
                          </div>
                          <div className="signal-bar">
                            <div className="signal-bar-fill signal-bar-fill-accent" style={{ width: `${health}%` }} />
                          </div>
                        </div>
                        <div className="signal-row">
                          <div className="signal-row-top">
                            <span>Margin</span>
                            <strong>{project.finance_snapshot.margin_percent.toFixed(1)}%</strong>
                          </div>
                          <div className="signal-bar">
                            <div
                              className={`signal-bar-fill ${
                                project.finance_snapshot.margin_percent < 25
                                  ? "signal-bar-fill-danger"
                                  : "signal-bar-fill-success"
                              }`}
                              style={{ width: `${clampPercent(project.finance_snapshot.margin_percent)}%` }}
                            />
                          </div>
                        </div>
                        <div className="stream-metric-row">
                          <div>
                            <span className="stream-label">Revenue</span>
                            <strong className="stream-number">{formatMoney(project.finance_snapshot.revenue_total)}</strong>
                          </div>
                          <div>
                            <span className="stream-label">Profit</span>
                            <strong className="stream-number">
                              {formatMoney(project.finance_snapshot.estimated_profit_total)}
                            </strong>
                          </div>
                        </div>
                        {project.finance_snapshot.below_minimum_positions > 0 ? (
                          <div className="row-meta project-warning">
                            {project.finance_snapshot.below_minimum_positions} строк ниже minimum
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </ManagerShell>
  );
}
