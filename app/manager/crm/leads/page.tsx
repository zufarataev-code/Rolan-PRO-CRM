import Link from "next/link";
import { redirect } from "next/navigation";

import { DealCreateButton } from "@/components/deal-create-button";
import { LeadCreatePanel } from "@/components/lead-create-panel";
import { ManagerShell } from "@/components/manager-shell";
import { getLeadsData } from "@/features/sales/server-api";
import { prisma } from "@/lib/db";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

export default async function LeadsPage() {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const leads = await getLeadsData();
  const cities = await prisma.city.findMany({
    where: {
      is_active: true,
    },
    orderBy: {
      sort_order: "asc",
    },
    select: {
      city_id: true,
      name_ru: true,
      name_en: true,
    },
  });

  return (
    <ManagerShell
      title="Лиды / Сделки"
      subtitle="Лиды, источник, стадия и контакт из реального sales API."
      kicker="Входящий поток"
      activeHref="/manager/crm/leads"
      actions={
        <>
          <button className="soft-button">Импорт</button>
          <Link href="#new-lead" className="accent-button">
            Новый лид
          </Link>
        </>
      }
    >
      <LeadCreatePanel cities={cities} />

      <section className="surface">
        <h2 className="surface-title">Таблица лидов</h2>
        <p className="surface-subtitle">Lead source, стадия, телефон и notes менеджера в одном проходе.</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Лид</th>
              <th>Источник</th>
              <th>Стадия</th>
              <th>Город</th>
              <th>Телефон</th>
              <th>Заметки</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.lead_id}>
                <td>
                  <div className="row-title">{lead.name}</div>
                  <div className="row-meta mono">{lead.lead_code}</div>
                </td>
                <td>{lead.source ?? "Без source"}</td>
                <td>
                  <span className="chip chip-accent">{lead.pipeline_status.name_ru}</span>
                </td>
                <td>{lead.city?.name_ru ?? "Без города"}</td>
                <td className="mono">{lead.phone ?? "нет телефона"}</td>
                <td className="row-meta">{lead.notes ?? "Без заметок"}</td>
                <td>
                  <DealCreateButton
                    title={`${lead.name} · Сделка`}
                    leadId={lead.lead_id}
                    notes={lead.notes}
                    label="В сделку"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </ManagerShell>
  );
}
