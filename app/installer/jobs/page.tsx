import Link from "next/link";
import { redirect } from "next/navigation";

import { InstallerShell } from "@/components/installer-shell";
import { INSTALLER_ONLY_ROLES } from "@/features/projects/api";
import { getInstallerJobsForSession } from "@/features/projects/service";
import { requireAppSession } from "@/lib/auth/app-session";

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString("ru-RU") : "—";
}

function formatTime(value: Date | null) {
  return value ? value.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export default async function InstallerJobsPage() {
  const session = await requireAppSession(INSTALLER_ONLY_ROLES);

  if (!session) {
    redirect("/");
  }

  const jobs = await getInstallerJobsForSession(session);

  return (
    <InstallerShell
      title="Мои монтажи"
      subtitle="Монтажник видит только свои назначенные позиции и текущий статус выполнения."
      kicker="Работы / Сегодня"
      activeHref="/legacy-crm/installer/jobs"
    >
      <section className="surface">
        <h2 className="surface-title">Назначенные работы</h2>
        {jobs.length === 0 ? (
          <div className="empty-state">Назначенных задач пока нет.</div>
        ) : (
          <div className="list-stack">
            {jobs.map((job) => (
              <div key={job.installer_job_id} className="list-row">
                <div className="chip chip-accent">{job.status}</div>
                <div>
                  <div className="row-title">
                    <Link href={`/legacy-crm/installer/jobs/${job.installer_job_id}`}>
                      {job.position?.title ?? job.project.title}
                    </Link>
                  </div>
                  <div className="row-meta">
                    {job.project.client?.name ?? "Без клиента"} • {job.project.address ?? "Адрес не указан"}
                  </div>
                  <div className="row-meta">
                    {formatDate(job.schedule?.date ?? null)} • {formatTime(job.schedule?.start_time ?? null)} -{" "}
                    {formatTime(job.schedule?.end_time ?? null)} • {job.schedule?.crew.name ?? "Crew TBD"}
                  </div>
                </div>
                <span className="row-meta mono">{job.project.project_code ?? job.project.project_id}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </InstallerShell>
  );
}
