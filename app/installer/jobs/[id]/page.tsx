import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InstallerJobStatusActions } from "@/components/installer-job-status-actions";
import { InstallerShell } from "@/components/installer-shell";
import { INSTALLER_ONLY_ROLES } from "@/features/projects/api";
import { getInstallerJobByIdForSession } from "@/features/projects/service";
import { requireAppSession } from "@/lib/auth/app-session";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString("ru-RU") : "—";
}

function formatTime(value: Date | null) {
  return value ? value.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function renderDynamicValue(value: string | number | boolean | null | undefined) {
  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }

  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

export default async function InstallerJobDetailPage({ params }: PageProps) {
  const session = await requireAppSession(INSTALLER_ONLY_ROLES);

  if (!session) {
    redirect("/");
  }

  const { id } = await params;
  const job = await getInstallerJobByIdForSession(session, id);

  if (!job) {
    notFound();
  }

  return (
    <InstallerShell
      title="Карточка монтажа"
      subtitle="Адрес, клиент, состав работ и действия по текущей монтажной задаче."
      kicker="Работы / Монтаж"
      activeHref="/legacy-crm/installer/jobs"
      actions={
        <Link href="/legacy-crm/installer/jobs" className="soft-button">
          Назад к задачам
        </Link>
      }
    >
      <section className="detail-grid">
        <div className="detail-band">
          <section className="surface">
            <div className="detail-hero">
              <div>
                <div className="page-kicker mono">{job.project.project_code ?? job.project.project_id}</div>
                <h2 className="detail-heading">{job.position?.title ?? job.project.title}</h2>
                <div className="detail-meta">
                  <span>{job.project.client?.name ?? "Без клиента"}</span>
                  <span>{job.project.address ?? "Адрес не указан"}</span>
                  <span>{job.schedule?.crew.name ?? "Crew TBD"}</span>
                </div>
              </div>

              <div className="project-inline-chips">
                <span className="chip">{job.status}</span>
                <span className="chip chip-accent">
                  {formatDate(job.schedule?.date ?? null)} • {formatTime(job.schedule?.start_time ?? null)} -{" "}
                  {formatTime(job.schedule?.end_time ?? null)}
                </span>
              </div>
            </div>
          </section>

          <section className="split-grid">
            <section className="surface">
              <h3 className="surface-title">Client & Site</h3>
              <div className="inspector-list">
                <div className="inspector-item">
                  <div className="row-title">Client</div>
                  <div className="row-meta">
                    {job.project.client?.name ?? "—"} • {job.project.client?.phone ?? "—"}
                  </div>
                </div>
                <div className="inspector-item">
                  <div className="row-title">Address</div>
                  <div className="row-meta">{job.project.address ?? "—"}</div>
                </div>
                <div className="inspector-item">
                  <div className="row-title">What to bring</div>
                  <div className="row-meta">{job.project.what_to_bring ?? "Не указано"}</div>
                </div>
              </div>
            </section>

            <section className="surface">
              <h3 className="surface-title">What To Do</h3>
              <div className="inspector-list">
                <div className="inspector-item">
                  <div className="row-title">{job.position?.service_type.name_ru ?? "Service position"}</div>
                  <div className="row-meta">
                    {job.position?.film
                      ? `${job.position.film.category_name_ru} / ${job.position.film.brand_name_ru} / ${job.position.film.model_name_ru}`
                      : "Без film details"}
                  </div>
                </div>
                <div className="inspector-item">
                  <div className="row-title">Position notes</div>
                  <div className="row-meta">{job.position?.notes ?? "Без notes"}</div>
                </div>
                <div className="inspector-item">
                  <div className="row-title">Project notes</div>
                  <div className="row-meta">{job.project.installer_notes ?? job.project.manager_notes ?? "Без notes"}</div>
                </div>
              </div>
            </section>
          </section>

          <section className="surface">
            <h3 className="surface-title">Execution Data</h3>
            {job.position ? (
              <div className="project-key-value-list">
                {Object.entries(job.position.dynamic_fields).map(([key, value]) => (
                  <div key={key} className="project-key-value">
                    <span>{key}</span>
                    <strong>{renderDynamicValue(value)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Для job не найден project position.</div>
            )}
          </section>
        </div>

        <div className="detail-band">
          <InstallerJobStatusActions installerJobId={job.installer_job_id} currentStatus={job.status} />

          <section className="surface">
            <h3 className="surface-title">Status Timeline</h3>
            <div className="inspector-list">
              <div className="inspector-item">
                <div className="row-title">On the way</div>
                <div className="row-meta">{job.on_the_way_at?.toLocaleString("ru-RU") ?? "—"}</div>
              </div>
              <div className="inspector-item">
                <div className="row-title">Started</div>
                <div className="row-meta">{job.started_at?.toLocaleString("ru-RU") ?? "—"}</div>
              </div>
              <div className="inspector-item">
                <div className="row-title">Paused</div>
                <div className="row-meta">{job.paused_at?.toLocaleString("ru-RU") ?? "—"}</div>
              </div>
              <div className="inspector-item">
                <div className="row-title">Completed</div>
                <div className="row-meta">{job.completed_at?.toLocaleString("ru-RU") ?? "—"}</div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </InstallerShell>
  );
}
