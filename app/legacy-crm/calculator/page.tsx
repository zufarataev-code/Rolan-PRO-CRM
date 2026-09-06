import { redirect } from "next/navigation";

import { SimpleQuickCalculator } from "@/components/simple-quick-calculator";
import {
  getServiceCalculatorBootstrap,
  withoutInternalCalculatorCosts,
} from "@/features/calculator/bootstrap";
import { getRecordManagerScope } from "@/features/sales/access";
import { listDeals } from "@/features/sales/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";
import { getBusinessPlanningSnapshot } from "@/lib/finance/business-planning";

type PageProps = {
  searchParams: Promise<{
    deal_id?: string;
    embed?: string;
  }>;
};

export default async function LegacyCrmCalculatorPage({ searchParams }: PageProps) {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const { deal_id: initialDealId, embed } = await searchParams;
  const managerScope = getRecordManagerScope(session);
  const [internalBootstrap, deals, planning] = await Promise.all([
    getServiceCalculatorBootstrap(),
    listDeals(managerScope),
    getBusinessPlanningSnapshot(),
  ]);

  const showInternalEconomics = session.roles.includes(ROLE_CODES.OWNER);
  const bootstrap = showInternalEconomics
    ? internalBootstrap
    : withoutInternalCalculatorCosts(internalBootstrap);
  const openDeals = deals.filter(
    (deal) => !["CLOSED_WON", "CLOSED_LOST"].includes(deal.pipeline_status.status_code),
  );
  const monthlyOverhead = planning.assumptions.monthly_overhead;
  const targetDeals = Math.max(1, planning.target.deals || 1);
  const recommendedOverheadPerDeal = monthlyOverhead / targetDeals;
  const targetProfitPerDeal = planning.assumptions.target_profit_monthly / targetDeals;
  const isEmbedded = embed === "1";

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", paddingBottom: 24 }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: isEmbedded ? "12px" : "18px" }}>
        {!isEmbedded ? (
          <header
            className="surface"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 14,
              padding: "12px 14px",
            }}
          >
            <div>
              <div className="page-kicker">ROLANPRO CRM</div>
              <h1 className="detail-heading" style={{ margin: "4px 0" }}>Быстрый калькулятор</h1>
            </div>
            <a href="/legacy-crm" className="soft-button">Назад в CRM</a>
          </header>
        ) : null}

        <SimpleQuickCalculator
          bootstrap={bootstrap}
          deals={openDeals.map((deal) => ({
            deal_id: deal.deal_id,
            deal_code: deal.deal_code ?? "DEAL",
            title: deal.title,
            contact_name: deal.client?.name ?? deal.lead?.name ?? deal.title,
            status_name: deal.pipeline_status.name_ru,
          }))}
          initialDealId={
            initialDealId && openDeals.some((deal) => deal.deal_id === initialDealId)
              ? initialDealId
              : null
          }
          showInternalEconomics={showInternalEconomics}
          monthlyOverhead={monthlyOverhead}
          recommendedOverheadPerDeal={recommendedOverheadPerDeal}
          targetProfitPerDeal={targetProfitPerDeal}
        />
      </div>
    </main>
  );
}
