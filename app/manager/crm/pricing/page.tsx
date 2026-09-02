import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { ServicePricingEditor } from "@/components/service-pricing-editor";
import { requireAppSession } from "@/lib/auth/app-session";
import { ROLE_CODES } from "@/lib/auth/constants";
import { withoutInternalPlanningCosts } from "@/lib/finance/business-planning";
import { getServicePricingPageData } from "@/lib/reference/pricing";

export default async function ManagerPricingPage() {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!session) redirect("/");

  const data = await getServicePricingPageData();
  const canViewCosts = session.roles.includes(ROLE_CODES.OWNER);
  const planning = canViewCosts ? data.planning : withoutInternalPlanningCosts(data.planning);
  const services = canViewCosts ? data.services : data.services.map((service) => ({
    ...service,
    material_cost_per_sqft: 0,
    installation_cost_per_sqft: 0,
    block_cost_price: 0,
  }));
  const addons = canViewCosts ? data.addons : data.addons.map((addon) => ({ ...addon, cost_price: 0 }));

  return (
    <ManagerShell
      title="Услуги и цены"
      subtitle={canViewCosts ? "Прайс для клиента, себестоимость работ и план безубыточности." : "Единый прайс для расчётов и план по лидам и сделкам."}
      kicker="Продажи / Прайс"
      activeHref="/manager/crm/pricing"
      actions={<Link href="/manager/crm/calculator" className="accent-button">Открыть калькулятор</Link>}
    >
      <ServicePricingEditor initialServices={services} initialAddons={addons} initialPlanning={planning} canViewCosts={canViewCosts} />
    </ManagerShell>
  );
}
