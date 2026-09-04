import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { listCompletedProjectsForSession } from "@/features/projects/archive";
import { requireAppSession } from "@/lib/auth/app-session";

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString("ru-RU") : "—";
}

function formatDateTime(value: Date) {
  return value.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CompletedProjectsPage() {
  const session = await requireAppSession(PROJECT_ACCESS_ROLES);

  if (!session) {
    redirect("/");
  }

  const projects = await listCompletedProjectsForSession(session);

  return (
    <ManagerShell
      title="Завершённые проекты"
      subtitle="Архив законченных монтажей. Проекты не удаляются и сохраняют клиента, исполнителей и историю."
      kicker="Работа / Проекты / Завершённые"
      activeHref="/manager/projects/completed"
      actions={
        <>
          <span className="chip chip-accent">{projects.length} завершено</span>
          <Link href="/manager/projects" className="accent-button">
            Активные проекты
          </Link>
        </>
      }
    >
      <section className="surface">
        <div className="surface-head">
          <div>
            <h2 className="surface-title">Архив монтажей</h2>
            <p className="surface-subtitle">
              После кнопки «Монтаж завершён» проект попадает сюда и остаётся доступным для истории и повторной работы.
            </p>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="empty-state">Завершённых проектов пока нет.</div>
        ) : (
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
                      <span className="chip chip-accent">✓ {project.project_status.name_ru}</span>
                      <span className="chip">Завершён {formatDateTime(project.completed_at)}</span>
                    </div>
                  </div>
                  <Link href={`/manager/projects/${project.project_id}`} className="soft-button">
                    Открыть историю
                  </Link>
                </div>

                <div className="project-stream-body">
                  <div className="project-stream-section">
                    <div className="stream-label">Клиент и объект</div>
                    <div className="row-title">{project.client?.name ?? "Без клиента"}</div>
                    <div className="row-meta">
                      {project.city?.name_ru ?? "Без города"} • {project.address ?? "Адрес не указан"}
                    </div>
                    <div className="row-meta">Монтаж: {formatDate(project.install_date)}</div>
                  </div>

                  <div className="project-stream-section">
                    <div className="stream-label">Исполнители</div>
                    <div className="row-title">
                      {project.installers.length
                        ? project.installers.map((installer) => installer.full_name).join(", ")
                        : "Исполнители не были зафиксированы"}
                    </div>
                    <div className="row-meta">{project.completion_note ?? "Монтаж закрыт без дополнительного комментария."}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </ManagerShell>
  );
}
