import { redirect } from "next/navigation";

import { MoneyTracker } from "@/components/money-tracker";
import { getRecordManagerScope } from "@/features/sales/access";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";
import { prisma } from "@/lib/db";

type PageProps = {
  searchParams: Promise<{ embed?: string }>;
};

export default async function LegacyCrmMoneyPage({ searchParams }: PageProps) {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  if (!session) redirect("/");

  const { embed } = await searchParams;
  const managerScope = getRecordManagerScope(session);
  const isOwner = session.roles.includes(ROLE_CODES.OWNER);

  const [deals, projects] = await Promise.all([
    prisma.deal.findMany({
      where: managerScope ? { assigned_manager_id: managerScope } : {},
      orderBy: { updated_at: "desc" },
      take: 250,
      select: {
        deal_id: true,
        deal_code: true,
        title: true,
        client: { select: { name: true } },
        lead: { select: { name: true } },
      },
    }),
    prisma.project.findMany({
      where: managerScope ? { manager_id: managerScope } : {},
      orderBy: { updated_at: "desc" },
      take: 250,
      select: {
        project_id: true,
        project_code: true,
        title: true,
        deal_id: true,
        client: { select: { name: true } },
      },
    }),
  ]);

  const scopes = [
    ...projects.map((project) => ({
      id: project.project_id,
      type: "project" as const,
      code: project.project_code ?? "PRJ",
      title: project.title,
      client_name: project.client.name,
      deal_id: project.deal_id,
    })),
    ...deals.map((deal) => ({
      id: deal.deal_id,
      type: "deal" as const,
      code: deal.deal_code ?? "DEAL",
      title: deal.title,
      client_name: deal.client?.name ?? deal.lead?.name ?? deal.title,
      deal_id: deal.deal_id,
    })),
  ];

  const isEmbedded = embed === "1";

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", paddingBottom: 24 }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: isEmbedded ? 12 : 18 }}>
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
              color: "#132435",
            }}
          >
            <div>
              <div className="page-kicker">ROLANPRO ERP</div>
              <h1 className="detail-heading" style={{ margin: "4px 0" }}>Money Tracker</h1>
            </div>
            <a href="/legacy-crm" className="soft-button">Назад в CRM</a>
          </header>
        ) : null}

        <MoneyTracker scopes={scopes} isOwner={isOwner} />
      </div>
    </main>
  );
}
