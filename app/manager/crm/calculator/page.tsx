import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { ServiceCalculator } from "@/components/service-calculator";
import {
  getServiceCalculatorBootstrap,
  withoutInternalCalculatorCosts,
} from "@/features/calculator/bootstrap";
import { getDealCardData } from "@/features/sales/server-api";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

type PageProps = {
  searchParams: Promise<{
    deal_id?: string;
  }>;
};

export default async function ServiceCalculatorPage({ searchParams }: PageProps) {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const { deal_id: dealId } = await searchParams;
  const [internalBootstrap, deal] = await Promise.all([
    getServiceCalculatorBootstrap(),
    dealId ? getDealCardData(dealId).catch(() => null) : Promise.resolve(null),
  ]);
  const showInternalEconomics = session.roles.includes(ROLE_CODES.OWNER);
  const bootstrap = showInternalEconomics
    ? internalBootstrap
    : withoutInternalCalculatorCosts(internalBootstrap);

  return (
    <ManagerShell
      title={deal ? `Расчет ${deal.deal_code}` : "Калькулятор"}
      subtitle={
        deal
          ? `Рассчитайте стоимость для клиента и сохраните результат в предложение «${deal.title}».`
          : showInternalEconomics
            ? "Рассчитайте цену для клиента и проверьте внутреннюю маржинальность."
            : "Рассчитайте цену для клиента. Внутренние расходы доступны только владельцу."
      }
      kicker="Продажи / Расчет"
      activeHref="/manager/crm/calculator"
      actions={
        deal ? (
          <>
            <Link href={`/manager/crm/deals/${deal.deal_id}`} className="soft-button">
              Назад к сделке
            </Link>
            <div className="chip chip-accent">{deal.pipeline_status.name_ru}</div>
          </>
        ) : undefined
      }
    >
      {deal ? (
        <section className="surface">
          <div className="detail-meta">
            <span>{deal.title}</span>
            <span>{deal.client?.name ?? deal.lead?.name ?? "Без клиента"}</span>
            <span>{deal.client?.service_address ?? "Адрес пока не добавлен"}</span>
          </div>
        </section>
      ) : null}
      <ServiceCalculator
        bootstrap={bootstrap}
        deal={deal}
        showInternalEconomics={showInternalEconomics}
      />
    </ManagerShell>
  );
}
