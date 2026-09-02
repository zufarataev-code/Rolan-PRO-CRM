import { redirect } from "next/navigation";

import { InstallerShell } from "@/components/installer-shell";
import { InstallerWorkdayControl } from "@/components/installer-workday-control";
import { getInstallerOperationsDashboard } from "@/features/installer-operations/service";
import { INSTALLER_ONLY_ROLES } from "@/features/projects/api";
import { requireAppSession } from "@/lib/auth/app-session";

function hours(minutes: number) { return `${(minutes / 60).toFixed(1)} ч`; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }

export default async function InstallerTodayPage() {
  const session = await requireAppSession(INSTALLER_ONLY_ROLES);
  if (!session) redirect("/");
  const dashboard = await getInstallerOperationsDashboard(session);

  return (
    <InstallerShell title="Мой рабочий день" subtitle="Смена, объекты, часы, пробег и личные начисления в одной истории." kicker="Rolan PRO CRM / Сегодня" activeHref="/legacy-crm/installer">
      <section className="metric-grid">
        <div className="metric-cell"><span className="metric-label">Часы</span><strong className="metric-value">{hours(dashboard.totals.work_minutes)}</strong><span className="metric-footnote">последние 30 смен</span></div>
        <div className="metric-cell"><span className="metric-label">Пробег</span><strong className="metric-value">{dashboard.totals.miles}</strong><span className="metric-footnote">miles</span></div>
        <div className="metric-cell"><span className="metric-label">Начислено</span><strong className="metric-value">{money(dashboard.totals.owed)}</strong><span className="metric-footnote">ещё не выплачено</span></div>
        <div className="metric-cell"><span className="metric-label">Выплачено</span><strong className="metric-value">{money(dashboard.totals.paid)}</strong><span className="metric-footnote">по закрытым начислениям</span></div>
      </section>

      <InstallerWorkdayControl activeSession={dashboard.active_session} jobs={dashboard.jobs} />

      <section className="split-grid">
        <section className="surface">
          <h2 className="surface-title">История смен</h2>
          {dashboard.history.length ? <div className="list-stack">{dashboard.history.map((item) => <div className="list-row" key={item.work_session_id}><div className="chip">{hours(item.work_minutes)}</div><div><div className="row-title">{item.installer_job?.position?.title ?? item.installer_job?.project.title ?? "Общая смена"}</div><div className="row-meta">{new Date(item.started_at).toLocaleDateString("ru-RU")} • {item.miles_driven} miles • {item.notes ?? "Без комментария"}</div></div></div>)}</div> : <div className="empty-state">Завершённые смены появятся здесь.</div>}
        </section>
        <section className="surface">
          <h2 className="surface-title">Моя зарплата</h2>
          <p className="surface-subtitle">Начисление создаётся после завершения монтажной задачи.</p>
          {dashboard.payroll.length ? <div className="list-stack">{dashboard.payroll.map((item) => <div className="list-row" key={item.payroll_accrual_id}><div className="chip chip-accent">{money(item.amount)}</div><div><div className="row-title">{item.service_name}</div><div className="row-meta">{item.project.project_code ?? item.project.title} • {item.quantity_sqft} sqft × ${item.rate_per_sqft} × {item.complexity_multiplier}</div><div className="row-meta">{item.status === "paid" ? "Выплачено" : "К выплате"}</div></div></div>)}</div> : <div className="empty-state">Начислений пока нет.</div>}
        </section>
      </section>
    </InstallerShell>
  );
}
