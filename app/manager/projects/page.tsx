import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { listProjectsForSession } from "@/features/projects/service";
import { requireAppSession } from "@/lib/auth/app-session";

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString("ru-RU") : "Дата не назначена";
}

function formatTimeRange(start: Date | null, end: Date | null) {
  if (!start && !end) return "Время не назначено";
  const startLabel = start
    ? start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "—";
  const endLabel = end
    ? end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "—";
  return `${startLabel} – ${endLabel}`;
}

export default async function ProjectsPage() {
  const session = await requireAppSession(PROJECT_ACCESS_ROLES);

  if (!session) {
    redirect("/");
  }

  const allProjects = await listProjectsForSession(session);
  const projects = allProjects.filter((project) => project.project_status.status_code !== "COMPLETED");
  const completedCount = allProjects.length - projects.length;
  const metrics = {
    active: projects.length,
    scheduled: projects.filter((project) => project.project_status.status_code === "SCHEDULED").length,
    inProgress: projects.filter((project) => project.project_status.status_code === "IN_PROGRESS").length,
    needsAssignment: projects.filter(
      (project) => !project.schedule || project.assigned_installers.length === 0,
    ).length,
  };

  return (
    <ManagerShell
      title="Активные проекты"
      subtitle="Рабочий цикл менеджера: состав проекта, исполнитель, даты монтажа, выполнение и завершение."
      kicker="Работа / Проекты"
      activeHref="/manager/projects"
      actions={
        <>
          <Link href="/manager/projects/new" className="accent-button">
            Создать проект
          </Link>
          <Link href="/manager/projects/completed" className="soft-button">
            Завершённые ({completedCount})
          </Link>
        </>
      }
    >
      <section className="workspace">
        <section className="metric-grid">
          <div className="metric-cell">
            <div className="metric-label">Активные</div>
            <div className="metric-value">{metrics.active}</div>
            <div className="metric-footnote">Текущие проекты</div>
          </div>
          <div className="metric-cell">
            <div className="metric-label">Запланированы</div>
            <div className="metric-value">{metrics.scheduled}</div>
            <div className="metric-footnote">Есть окно монтажа</div>
          </div>
          <div className="metric-cell">
            <div className="metric-label">В монтаже</div>
            <div className="metric-value">{metrics.inProgress}</div>
            <div className="metric-footnote">Работы начаты</div>
          </div>
          <div className="metric-cell">
            <div className="metric-label">Нужно назначить</div>
            <div className="metric-value">{metrics.needsAssignment}</div>
            <div className="metric-footnote">Нет даты или исполнителя</div>
          </div>
        </section>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2 className="surface-title">Рабочая очередь проектов</h2>
              <p className="surface-subtitle">
                Завершённые проекты сюда больше не попадают. После кнопки «Монтаж завершён» они переходят в архив.
              </p>
            </div>
            <div className="surface-actions">
              <Link href="/manager/calendar" className="soft-button">
                Расписание
              </Link>
              <Link href="/manager/projects/completed" className="soft-button">
                Архив
              </Link>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="empty-state">
              Активных проектов нет. Завершённые проекты доступны в архиве.
            </div>
          ) : (
            <div className="project-stream">
              {projects.map((project) => {
                const hasSchedule = Boolean(project.schedule);
                const hasInstaller = project.assigned_installers.length > 0;

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
                          {project.problem_flag ? <span className="chip chip-danger">Problem</span> : null}
                          {!hasSchedule ? <span className="chip">Нужна дата</span> : null}
                          {!hasInstaller ? <span className="chip">Нужен исполнитель</span> : null}
                        </div>
                      </div>

                      <div className="surface-actions">
                        {hasSchedule && hasInstaller ? null : (
                          <Link href={`/manager/projects/${project.project_id}#assignment`} className="soft-button">
                            Назначить монтаж
                          </Link>
                        )}
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
                        <div className="row-meta">{project.service_summary || "Состав проекта не заполнен"}</div>
                      </div>

                      <div className="project-stream-section">
                        <div className="stream-label">Монтаж</div>
                        <div className="row-title">
                          {project.assigned_installers.length
                            ? project.assigned_installers.map((installer) => installer.full_name).join(", ")
                            : "Исполнитель не назначен"}
                        </div>
                        <div className="row-meta">{formatDate(project.install_date)}</div>
                        <div className="row-meta">{formatTimeRange(project.start_time, project.end_time)}</div>
                        <div className="row-meta">{project.schedule?.crew ?? "Crew не назначен"}</div>
                      </div>

                      <div className="project-stream-section">
                        <div className="stream-label">Готовность к монтажу</div>
                        <div className="inspector-list">
                          <div className="inspector-item">
                            <div className="row-title">Состав проекта</div>
                            <div className="row-meta">
                              {project.positions_count > 0 ? `${project.positions_count} позиций` : "Не заполнен"}
                            </div>
                          </div>
                          <div className="inspector-item">
                            <div className="row-title">Исполнитель</div>
                            <div className="row-meta">{hasInstaller ? "Назначен" : "Требуется назначить"}</div>
                          </div>
                          <div className="inspector-item">
                            <div className="row-title">Дата</div>
                            <div className="row-meta">{hasSchedule ? "Назначена" : "Требуется назначить"}</div>
                          </div>
                        </div>
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
