import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";
import { listConsultationsForSession } from "@/features/consultations/service";

export default async function ManagerConsultationsPage() {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const consultations = await listConsultationsForSession(session);

  return (
    <ManagerShell
      title="Замеры"
      subtitle="Назначенные выезды, статус замера, рекомендации и переход к коммерческому предложению."
      kicker="Клиенты / Замеры"
      activeHref="/manager/crm/consultations"
      actions={<div className="chip chip-accent">{consultations.length} карточек</div>}
    >
      <section className="surface">
        <h2 className="surface-title">Список консультаций</h2>
        <p className="surface-subtitle">
          После завершения survey результаты сразу доступны менеджеру без дополнительного handoff.
        </p>

        {consultations.length === 0 ? (
          <div className="empty-state">Консультации пока не назначены.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Карточка</th>
                <th>Консультант</th>
                <th>Когда</th>
                <th>Survey status</th>
                <th>Результат</th>
              </tr>
            </thead>
            <tbody>
              {consultations.map((consultation) => (
                <tr key={consultation.consultation_id}>
                  <td>
                    <div className="row-title">
                      <Link href={`/manager/crm/consultations/${consultation.consultation_id}`}>{consultation.title}</Link>
                    </div>
                    <div className="row-meta">{consultation.client?.name ?? consultation.lead?.name ?? "Без клиента"}</div>
                  </td>
                  <td>
                    <div className="row-title">{consultation.assigned_consultant.full_name}</div>
                    <div className="row-meta">{consultation.assigned_manager?.full_name ?? "без менеджера"}</div>
                  </td>
                  <td>
                    <div className="row-title mono">{consultation.scheduled_start_at.toLocaleString("ru-RU")}</div>
                    <div className="row-meta mono">{consultation.scheduled_end_at.toLocaleString("ru-RU")}</div>
                  </td>
                  <td>
                    <span className="chip">{consultation.survey?.status ?? "draft"}</span>
                  </td>
                  <td>
                    <div className="row-title">{consultation.survey?.counts.measurements ?? 0} замеров</div>
                    <div className="row-meta">{consultation.survey?.counts.recommendations ?? 0} рекомендаций</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </ManagerShell>
  );
}
