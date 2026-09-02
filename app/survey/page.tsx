import Link from "next/link";
import { redirect } from "next/navigation";

import { ConsultantShell } from "@/components/consultant-shell";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";
import { listConsultationsForSession } from "@/features/consultations/service";

export default async function SurveyHomePage() {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER, ROLE_CODES.CONSULTANT]);

  if (!session) {
    redirect("/");
  }

  const consultations = await listConsultationsForSession(session);

  return (
    <ConsultantShell
      title="Мои консультации"
      subtitle="Назначенные выезды, данные клиента и готовая форма замера."
      kicker="Выезды / Сегодня"
      activeHref="/legacy-crm/survey"
      actions={<div className="chip chip-accent">{consultations.length} консультаций</div>}
    >
      <section className="surface">
        <h2 className="surface-title">Назначенные консультации</h2>
        <p className="surface-subtitle">
          Консультант видит только свои консультации, связанный lead/deal context и статус survey.
        </p>

        {consultations.length === 0 ? (
          <div className="empty-state">Назначенных консультаций пока нет.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Консультация</th>
                <th>Клиент</th>
                <th>Когда</th>
                <th>Статус</th>
                <th>Survey</th>
              </tr>
            </thead>
            <tbody>
              {consultations.map((consultation) => (
                <tr key={consultation.consultation_id}>
                  <td>
                    <div className="row-title">
                      <Link href={`/legacy-crm/survey/consultations/${consultation.consultation_id}`}>
                        {consultation.title}
                      </Link>
                    </div>
                    <div className="row-meta">{consultation.location_address ?? "Адрес будет добавлен"}</div>
                  </td>
                  <td>
                    <div className="row-title">{consultation.client?.name ?? consultation.lead?.name ?? "Без клиента"}</div>
                    <div className="row-meta mono">{consultation.client?.phone ?? "нет телефона"}</div>
                  </td>
                  <td>
                    <div className="row-title mono">{consultation.scheduled_start_at.toLocaleString("ru-RU")}</div>
                    <div className="row-meta mono">{consultation.scheduled_end_at.toLocaleString("ru-RU")}</div>
                  </td>
                  <td>
                    <span className="chip">{consultation.status}</span>
                  </td>
                  <td>
                    <div className="row-title">{consultation.survey?.status ?? "draft"}</div>
                    <div className="row-meta">
                      {consultation.survey?.counts.measurements ?? 0} замеров • {consultation.survey?.counts.recommendations ?? 0} рекомендаций
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </ConsultantShell>
  );
}
