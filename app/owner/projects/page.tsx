import Link from "next/link";
import { redirect } from "next/navigation";

import { OwnerShell } from "@/components/owner-shell";
import { OWNER_ONLY_ROLES } from "@/features/owner/api";
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

function clampPercent(value: number, min = 8) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(100, Math.round(value)));
}

export default async function OwnerProjectsPage() {
  const session = await requireAppSession(OWNER_ONLY_ROLES);

  if (!session) {
    redirect("/");
  }

  const projects = await listProjectsForSession(session);
  const totalRevenue = projects.reduce((sum, project) => sum + project.finance_snapshot.revenue_total, 0);
  const avgMargin = projects.length
    ? projects.reduce((sum, project) => sum + project.finance_snapshot.margin_percent, 0) / projects.length
    : 0;

  return (
    <OwnerShell
      title="Контроль проектов"
      subtitle="Обзор всех проектов: деньги, риски, текущий статус и готовность к назначению работ."
      kicker="Управление / Проекты"
      activeHref="/owner/projects"
      actions={
        <>
          <Link href="/owner/finance" className="soft-button">
            Финансы
          </Link>
        </>
      }
    >
      <section className="workspace">
        <section className="workspace-hero">
          <div className="ops-hero">
            <div className="hero-command">
              <div className="hero-tag-row">
                <span className="brand-tag brand-tag-live">Owner portfolio</span>
                <span className="brand-tag">Risk tags</span>
                <span className="brand-tag">Margin</span>
                <span className="brand-tag">Scheduling</span>
              </div>
              <div>
                <h2 className="hero-heading">Портфель проектов</h2>
                <p className="hero-copy">
                  Owner-уровень по всем проектам: статусы, crew, schedule readiness, прибыль и точки внимания в одном
                  потоке.
                </p>
              </div>
              <div className="inline-stat-grid">
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Projects</span>
                  <strong className="inline-stat-value">{projects.length}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Revenue</span>
                  <strong className="inline-stat-value">{formatMoney(totalRevenue)}</strong>
                </div>
                <div className="inline-stat-card">
                  <span className="inline-stat-label">Avg margin</span>
                  <strong className="inline-stat-value">{avgMargin.toFixed(1)}%</strong>
                </div>
              </div>
            </div>

            <div className="metric-grid">
              <div className="metric-cell">
                <div className="metric-label">Проекты</div>
                <div className="metric-value">{projects.length}</div>
                <div className="metric-footnote">Owner portfolio</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">В работе</div>
                <div className="metric-value">
                  {projects.filter((project) => project.project_status.status_code === "IN_PROGRESS").length}
                </div>
                <div className="metric-footnote">Активные installs</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Attention</div>
                <div className="metric-value">{projects.filter((project) => project.status_flags.needs_attention).length}</div>
                <div className="metric-footnote">Риски и overdue</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Scheduled</div>
                <div className="metric-value">{projects.filter((project) => project.schedule).length}</div>
                <div className="metric-footnote">Crew assigned</div>
              </div>
            </div>
          </div>
        </section>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2 className="surface-title">Все проекты</h2>
              <p className="surface-subtitle">Портфель owner-уровня с тегами риска, crew и финансовыми индикаторами.</p>
            </div>
          </div>

          <div className="project-stream">
            {projects.map((project) => (
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
                      {project.status_flags.is_new ? <span className="chip chip-accent">new</span> : null}
                      {project.status_flags.is_overdue ? <span className="chip chip-danger">overdue</span> : null}
                      {project.status_flags.needs_attention ? <span className="chip">attention</span> : null}
                    </div>
                  </div>
                  <div className="surface-actions">
                    <Link href={`/manager/projects/${project.project_id}`} className="accent-button">
                      Открыть
                    </Link>
                  </div>
                </div>

                <div className="project-stream-body">
                  <div className="project-stream-section">
                    <div className="stream-label">Клиент</div>
                    <div className="row-title">{project.client?.name ?? "—"}</div>
                    <div className="row-meta">{project.address ?? "Адрес не указан"}</div>
                    <div className="row-meta">{project.service_summary || "Без позиций"}</div>
                  </div>

                  <div className="project-stream-section">
                    <div className="stream-label">Монтаж</div>
                    <div className="row-title">{formatDate(project.install_date)}</div>
                    <div className="row-meta">{project.schedule?.crew ?? "Не назначен"}</div>
                    <div className="row-meta">{project.lead_installer?.full_name ?? "Lead не назначен"}</div>
                  </div>

                  <div className="project-stream-section">
                    <div className="stream-label">Индикаторы</div>
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
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </OwnerShell>
  );
}
