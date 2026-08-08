import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { ProjectManualCreatePanel } from "@/components/project-manual-create-panel";
import {
  getServiceCalculatorBootstrap,
  withoutInternalCalculatorCosts,
} from "@/features/calculator/bootstrap";
import { PROJECT_ACCESS_ROLES } from "@/features/projects/api";
import { getProjectExecutionOptions } from "@/features/projects/service";
import { requireAppSession } from "@/lib/auth/app-session";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

type PageProps = {
  searchParams: Promise<{
    client_name?: string;
    phone?: string;
    email?: string;
    city_id?: string;
    project_title?: string;
    project_notes?: string;
  }>;
};

export default async function ManualProjectCreatePage({ searchParams }: PageProps) {
  const session = await requireAppSession(PROJECT_ACCESS_ROLES);

  if (!session) {
    redirect("/");
  }

  const params = await searchParams;
  const [internalBootstrap, executionOptions, cities] = await Promise.all([
    getServiceCalculatorBootstrap(),
    getProjectExecutionOptions(),
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
        default_zip_code: true,
      },
    }),
  ]);
  const showInternalEconomics = session.roles.includes(ROLE_CODES.OWNER);
  const bootstrap = showInternalEconomics
    ? internalBootstrap
    : withoutInternalCalculatorCosts(internalBootstrap);

  return (
    <ManagerShell
      title="Новый проект"
      subtitle={showInternalEconomics
        ? "Создайте проект вручную и проверьте его внутреннюю экономику."
        : "Создайте проект вручную: клиент, услуга, материал, объем и исполнитель."
      }
      kicker="Проекты / Новый"
      activeHref="/manager/projects"
      actions={
        <>
          <Link href="/manager/projects" className="soft-button">
            Назад к проектам
          </Link>
          <div className="chip chip-accent">Quick entry</div>
        </>
      }
    >
      <section className="workspace">
        <section className="workspace-hero">
          <div className="ops-hero">
            <div className="hero-command">
              <div className="hero-tag-row">
                <span className="brand-tag brand-tag-live">Manual project</span>
                <span className="brand-tag">Client contact</span>
                <span className="brand-tag">Installer</span>
                <span className="brand-tag">Live P&amp;L</span>
              </div>
              <div>
                <h2 className="hero-heading">Окно быстрого ввода проекта</h2>
                <p className="hero-copy">
                  Заполняй клиента, услугу, материал, расход для клиента, фактический расход, цену монтажа и прочие
                  расходы в одном экране. После сохранения проект сразу попадает в operational список CRM.
                </p>
              </div>
              <div className="action-cluster">
                <Link href="/manager/projects" className="soft-button">
                  Все проекты
                </Link>
                <Link href="/manager/calendar" className="soft-button">
                  Scheduling
                </Link>
              </div>
            </div>
          </div>
        </section>

        <ProjectManualCreatePanel
          serviceTypes={bootstrap.service_types}
          films={bootstrap.film_catalog}
          installers={executionOptions.installers}
          cities={cities}
          initialValues={params}
          showInternalEconomics={showInternalEconomics}
        />
      </section>
    </ManagerShell>
  );
}
