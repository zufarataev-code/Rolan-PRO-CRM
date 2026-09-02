import Link from "next/link";
import { redirect } from "next/navigation";

import { ConsultantShell } from "@/components/consultant-shell";
import { InstallerShell } from "@/components/installer-shell";
import { ManagerShell } from "@/components/manager-shell";
import { listNotificationsForSession } from "@/features/core/notifications";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru-RU");
}

export default async function NotificationsPage() {
  const session = await requireAppSession([
    ROLE_CODES.OWNER,
    ROLE_CODES.MANAGER,
    ROLE_CODES.CONSULTANT,
    ROLE_CODES.INSTALLER,
  ]);

  if (!session) {
    redirect("/");
  }

  const notifications = await listNotificationsForSession(session);
  const backHref = session.roles.includes(ROLE_CODES.INSTALLER)
    ? "/legacy-crm/installer"
    : session.roles.includes(ROLE_CODES.CONSULTANT)
    ? "/legacy-crm/survey"
    : "/manager";

  const content = (
    <section className="surface">
      <h2 className="surface-title">Notifications</h2>
      <p className="surface-subtitle">
        Живые уведомления по событиям pipeline. New badge = unread, overdue/attention считаются по текущим due dates.
      </p>

      <div className="kpi-ribbon">
        <div className="kpi-pill">
          <span>Unread</span>
          <strong>{notifications.items.filter((item) => item.is_new).length}</strong>
        </div>
        <div className="kpi-pill">
          <span>Overdue tasks</span>
          <strong>{notifications.counters.overdue_tasks}</strong>
        </div>
        <div className="kpi-pill">
          <span>Overdue follow-ups</span>
          <strong>{notifications.counters.overdue_follow_ups}</strong>
        </div>
      </div>

      <div className="list-stack">
        {notifications.items.length ? (
          notifications.items.map((item) => (
            <div key={item.notification_id} className="list-row">
              <div className={`chip${item.is_new ? " chip-accent" : ""}`}>{item.is_new ? "new" : "read"}</div>
              <div>
                <div className="row-title">{item.title}</div>
                <div className="row-meta">{item.message}</div>
                <div className="row-meta">
                  {item.actor} • {formatDateTime(item.created_at_iso)}
                </div>
              </div>
              <span className="chip">{item.type_key}</span>
            </div>
          ))
        ) : (
          <div className="empty-state">Уведомлений пока нет.</div>
        )}
      </div>
    </section>
  );

  if (session.roles.includes(ROLE_CODES.INSTALLER)) {
    return (
      <InstallerShell
        title="Notifications"
        subtitle="Изменения по вашим jobs и schedule."
        kicker="Installer"
        actions={
          <Link href={backHref} className="soft-button">
            Назад
          </Link>
        }
      >
        {content}
      </InstallerShell>
    );
  }

  if (session.roles.includes(ROLE_CODES.CONSULTANT)) {
    return (
      <ConsultantShell
        title="Notifications"
        subtitle="Назначения и live-события по consultation flow."
        kicker="Survey"
        actions={
          <Link href={backHref} className="soft-button">
            Назад
          </Link>
        }
      >
        {content}
      </ConsultantShell>
    );
  }

  return (
    <ManagerShell
      title="Notifications"
      subtitle="События pipeline, задачи и сигналы внимания."
      kicker="Pipeline / Alerts"
      actions={
        <Link href={backHref} className="soft-button">
          Назад
        </Link>
      }
    >
      {content}
    </ManagerShell>
  );
}
