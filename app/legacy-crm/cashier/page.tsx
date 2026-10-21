import { redirect } from "next/navigation";

import { ProjectCashier } from "@/components/project-cashier";
import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { loadCashierCatalog } from "@/features/projects/cashier-service";
import { requireAppSession } from "@/lib/auth/app-session";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

type PageProps = {
  searchParams: Promise<{ embed?: string; client_id?: string; client_name?: string; phone?: string; email?: string; service_address?: string }>;
};

/**
 * Касса проекта: единственный экран, где менеджер собирает проект из карточек.
 * Открывается из «Создать → Касса проекта» в /legacy-crm (embed=1 — внутри фрейма).
 */
export default async function LegacyCrmCashierPage({ searchParams }: PageProps) {
  const session = await requireAppSession(PROJECT_ACCESS_ROLES);
  if (!session) redirect("/");

  const params = await searchParams;
  const [bundle, users] = await Promise.all([
    loadCashierCatalog(),
    prisma.user.findMany({
      where: { is_active: true, user_accesses: { some: { is_active: true, role: { is_active: true, code: { in: [ROLE_CODES.CONSULTANT, ROLE_CODES.INSTALLER] } } } } },
      select: { user_id: true, full_name: true, user_accesses: { where: { is_active: true }, select: { role: { select: { code: true } } } } },
      orderBy: { full_name: "asc" },
    }),
  ]);
  const consultants = users.filter((user) => user.user_accesses.some((access) => access.role.code === ROLE_CODES.CONSULTANT)).map(({ user_id, full_name }) => ({ user_id, full_name }));
  const installers = users.filter((user) => user.user_accesses.some((access) => access.role.code === ROLE_CODES.INSTALLER)).map(({ user_id, full_name }) => ({ user_id, full_name }));
  const isEmbedded = params.embed === "1";

  return (
    <main className="legacy-calculator-page">
      <div className={`legacy-calculator-frame cashier-frame${isEmbedded ? " legacy-calculator-frame-embedded" : ""}`}>
        {!isEmbedded ? (
          <header className="surface legacy-calculator-header">
            <div>
              <div className="page-kicker">Проекты</div>
              <h1 className="detail-heading" style={{ margin: 0 }}>Касса проекта</h1>
              <p className="detail-meta" style={{ margin: "4px 0 0" }}>Тапай карточки — чек собирается сам. Цены из справочника, ниже минимума продать нельзя.</p>
            </div>
            <a className="soft-button" href="/legacy-crm">← К заказам</a>
          </header>
        ) : null}
        <ProjectCashier
          directions={bundle.directions}
          films={bundle.catalog.films}
          addons={bundle.catalog.addons}
          accessLevels={bundle.catalog.access_levels ?? []}
          consultants={consultants}
          installers={installers}
          initialClient={{ client_id: params.client_id, client_name: params.client_name, phone: params.phone, email: params.email, service_address: params.service_address }}
          embedded={isEmbedded}
        />
      </div>
    </main>
  );
}
