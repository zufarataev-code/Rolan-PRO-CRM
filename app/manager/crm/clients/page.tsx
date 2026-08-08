import Link from "next/link";
import { redirect } from "next/navigation";

import { ClientCreatePanel } from "@/components/client-create-panel";
import { DealCreateButton } from "@/components/deal-create-button";
import { ManagerShell } from "@/components/manager-shell";
import { getClientsData } from "@/features/sales/server-api";
import { prisma } from "@/lib/db";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

export default async function SalesClientsPage() {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const [clients, cities] = await Promise.all([
    getClientsData(),
    prisma.city.findMany({
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
    }),
  ]);

  return (
    <ManagerShell
      title="Клиенты"
      subtitle="Клиенты и их sales context до перехода в operations."
      kicker="Клиентская база"
      activeHref="/manager/crm/clients"
      actions={
        <>
          <button className="soft-button">Поиск</button>
          <Link href="#new-client" className="accent-button">
            Новый клиент
          </Link>
        </>
      }
    >
      <ClientCreatePanel cities={cities} />

      <section className="surface">
        <h2 className="surface-title">Список клиентов</h2>
        <p className="surface-subtitle">Продажный контекст теперь идет из clients API, а не из mock-таблицы.</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Город</th>
              <th>Телефон</th>
              <th>Сделки</th>
              <th>Проекты</th>
              <th>Email</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.client_id}>
                <td>
                  <div className="row-title">{client.name}</div>
                  <div className="row-meta mono">{client.client_code}</div>
                </td>
                <td>{client.city?.name_ru ?? "Без города"}</td>
                <td className="mono">{client.phone ?? "нет телефона"}</td>
                <td>{client.counts.deals}</td>
                <td>{client.counts.projects}</td>
                <td className="row-meta">{client.email ?? "нет email"}</td>
                <td>
                  <DealCreateButton
                    title={`${client.name} · Сделка`}
                    clientId={client.client_id}
                    label="Создать сделку"
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
