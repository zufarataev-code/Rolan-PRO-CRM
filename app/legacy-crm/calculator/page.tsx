import { redirect } from "next/navigation";

import { QuickEstimateCalculator } from "@/components/quick-estimate-calculator";
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
  }>;
};

export default async function LegacyCrmCalculatorPage({ searchParams }: PageProps) {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const { deal_id: initialDealId } = await searchParams;
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
  const recommendedFixedCost =
    planning.target.deals > 0 ? monthlyOverhead / planning.target.deals : 0;
  const targetNetMarginPercent =
    planning.target.revenue > 0
      ? (planning.assumptions.target_profit_monthly / planning.target.revenue) * 100
      : 0;

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", paddingBottom: 32 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px" }}>
        <header
          className="surface"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            padding: "14px 16px",
          }}
        >
          <div>
            <div className="page-kicker">ROLANPRO CRM</div>
            <h1 className="detail-heading" style={{ margin: "4px 0" }}>
              Быстрый калькулятор
            </h1>
            <div className="detail-meta">
              <span>Ориентир цены за минуту. Без комнат, окон и точной пленки.</span>
            </div>
          </div>
          <a href="/legacy-crm" target="_top" className="soft-button">
            Назад в CRM
          </a>
        </header>

        <QuickEstimateCalculator
          bootstrap={bootstrap}
          deals={openDeals.map((deal) => ({
            deal_id: deal.deal_id,
            deal_code: deal.deal_code ?? "DEAL",
            title: deal.title,
            client_name: deal.client?.name ?? null,
            lead_name: deal.lead?.name ?? null,
            status_name: deal.pipeline_status.name_ru,
          }))}
          initialDealId={
            initialDealId && openDeals.some((deal) => deal.deal_id === initialDealId)
              ? initialDealId
              : null
          }
          showInternalEconomics={showInternalEconomics}
          monthlyOverhead={monthlyOverhead}
          recommendedFixedCost={recommendedFixedCost}
          targetNetMarginPercent={targetNetMarginPercent}
        />
      </div>
    </main>
  );
}
