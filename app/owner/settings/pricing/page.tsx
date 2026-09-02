import Link from "next/link";
import { redirect } from "next/navigation";

import { OwnerShell } from "@/components/owner-shell";
import { ServicePricingEditor } from "@/components/service-pricing-editor";
import { OWNER_ONLY_ROLES } from "@/features/owner/api";
import { requireAppSession } from "@/lib/auth/app-session";
import { getServicePricingPageData } from "@/lib/reference/pricing";

export default async function OwnerPricingPage() {
  const session = await requireAppSession(OWNER_ONLY_ROLES);
  if (!session) redirect("/");

  const data = await getServicePricingPageData();
  return (
    <OwnerShell
      title="Услуги, цены и план продаж"
      subtitle="Единый прайс Rolan PRO, ставки работ и контроль точки безубыточности."
      kicker="Система / Прайс"
      activeHref="/owner/settings/pricing"
      actions={<><Link href="/owner/settings" className="soft-button">Все настройки</Link><Link href="/owner/finance/services" className="accent-button">Прибыль по услугам</Link></>}
    >
      <ServicePricingEditor initialServices={data.services} initialAddons={data.addons} initialPlanning={data.planning} canViewCosts />
    </OwnerShell>
  );
}
