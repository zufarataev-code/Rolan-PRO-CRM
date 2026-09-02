import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { getInstallerTeamOverview } from "@/features/installer-operations/service";
import { PROJECT_RUNTIME_MANAGER_ROLES } from "@/features/projects/api";
import { requireAppSession } from "@/lib/auth/app-session";

function hours(minutes: number) { return `${(minutes / 60).toFixed(1)} ч`; }

export default async function InstallerTeamPage() {
  const session = await requireAppSession(PROJECT_RUNTIME_MANAGER_ROLES);
  if (!session) redirect("/");
  const installers = await getInstallerTeamOverview();

  return (
    <ManagerShell title="Монтажники" subtitle="Кто сейчас на смене, на каком объекте и когда передал последнее рабочее местоположение." kicker="Команда / Монтаж" activeHref="/manager/installers">
      <section className="surface">
        <h2 className="surface-title">Бригада сейчас</h2>
        {installers.length ? <div className="list-stack">{installers.map((installer) => {
          const active = installer.active_session;
          return <div className="list-row" key={installer.user_id}>
            <div className={active ? "chip chip-accent" : "chip"}>{active ? "На смене" : "Не на смене"}</div>
            <div><div className="row-title">{installer.full_name}</div><div className="row-meta">{active?.installer_job?.position?.title ?? active?.installer_job?.project.title ?? "Объект не выбран"}</div><div className="row-meta">{active ? `${hours(active.work_minutes)} • ${active.installer_job?.project.address ?? "без адреса"}` : installer.email}</div></div>
            <div className="installer-location-status">{active?.last_location_at && active.last_latitude != null && active.last_longitude != null ? <><a className="soft-button" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${active.last_latitude},${active.last_longitude}`}>Открыть на карте</a><span className="row-meta">обновлено {new Date(active.last_location_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span></> : <span className="row-meta">Геолокация не передаётся</span>}</div>
          </div>;
        })}</div> : <div className="empty-state">Активных учётных записей монтажников нет.</div>}
      </section>
      <section className="surface"><h2 className="surface-title">Как работает отслеживание</h2><p className="row-meta">Монтажник сам включает геолокацию при начале смены. Она прекращается при завершении смены и работает только пока приложение открыто. Скрытого круглосуточного отслеживания нет.</p></section>
    </ManagerShell>
  );
}
