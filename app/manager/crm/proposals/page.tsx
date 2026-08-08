import Link from "next/link";
import { redirect } from "next/navigation";

import { ManagerShell } from "@/components/manager-shell";
import { ProposalLaunchPanel } from "@/components/proposal-launch-panel";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";
import { getProposalList, getSurveyReadyDeals } from "@/features/proposals/service";

export default async function ProposalsPage() {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const [proposals, surveyReadyDeals] = await Promise.all([
    getProposalList(session),
    getSurveyReadyDeals(session),
  ]);

  return (
    <ManagerShell
      title="Коммерческие предложения"
      subtitle="Подготовьте предложение после замера, отправьте ссылку клиенту и отслеживайте согласование."
      kicker="Продажи / Предложения"
      activeHref="/manager/crm/proposals"
      actions={<div className="chip chip-accent">{proposals.length} proposals</div>}
    >
      <section className="workspace">
        <ProposalLaunchPanel surveyReadyDeals={surveyReadyDeals} />

        <section className="surface">
          <h2 className="surface-title">Список proposal</h2>
          <p className="surface-subtitle">
            Менеджер видит статус клиента, selected total, agreement и публичную ссылку.
          </p>

          {proposals.length === 0 ? (
            <div className="empty-state">Proposal пока не созданы.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Клиент</th>
                  <th>Статус</th>
                  <th>Total</th>
                  <th>Agreement</th>
                  <th>Client Page</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => (
                  <tr key={proposal.proposal_id}>
                    <td>
                      <div className="row-title">
                        <Link href={`/manager/crm/proposals/${proposal.proposal_id}`}>{proposal.title}</Link>
                      </div>
                      <div className="row-meta mono">{proposal.proposal_code}</div>
                    </td>
                    <td>
                      <div className="row-title">{proposal.client?.name ?? "Без клиента"}</div>
                      <div className="row-meta">{proposal.deal?.title ?? "Без сделки"}</div>
                    </td>
                    <td>
                      <span className="chip">{proposal.status}</span>
                    </td>
                    <td>
                      <div className="row-title">${proposal.selected_total_amount.toFixed(2)}</div>
                      <div className="row-meta">subtotal ${proposal.subtotal_amount.toFixed(2)}</div>
                    </td>
                    <td>
                      <div className="row-title">{proposal.agreement_status ?? "pending"}</div>
                    </td>
                    <td>
                      <a href={proposal.public_url} target="_blank" rel="noreferrer" className="soft-button">
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </section>
    </ManagerShell>
  );
}
