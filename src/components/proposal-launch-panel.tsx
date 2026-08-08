"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SurveyReadyDeal = {
  deal_id: string;
  deal_code: string | null;
  title: string;
  client: {
    client_id: string;
    name: string;
  } | null;
  proposals_count: number;
  latest_completed_survey: {
    survey_id: string;
    consultation_id: string;
    title: string;
  } | null;
};

type ProposalLaunchPanelProps = {
  surveyReadyDeals: SurveyReadyDeal[];
};

export function ProposalLaunchPanel({ surveyReadyDeals }: ProposalLaunchPanelProps) {
  const router = useRouter();
  const [pendingDealId, setPendingDealId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("Создайте proposal из survey-ready сделки.");

  async function handleCreate(deal: SurveyReadyDeal) {
    setPendingDealId(deal.deal_id);
    setMessage("Создаю proposal...");

    try {
      const response = await fetch("/api/v1/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deal_id: deal.deal_id,
          survey_id: deal.latest_completed_survey?.survey_id ?? null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            data?: {
              proposal?: {
                proposal_id: string;
              };
            };
            errors?: Array<{ message?: string }>;
          }
        | null;

      if (!response.ok || !payload?.data?.proposal?.proposal_id) {
        throw new Error(payload?.errors?.[0]?.message ?? "Не удалось создать proposal.");
      }

      router.push(`/manager/crm/proposals/${payload.data.proposal.proposal_id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать proposal.");
      setPendingDealId(null);
    }
  }

  return (
    <section className="surface">
      <h2 className="surface-title">Survey-ready сделки</h2>
      <p className="surface-subtitle">
        Здесь менеджер запускает proposal builder на основе завершенного survey.
      </p>

      {surveyReadyDeals.length === 0 ? (
        <div className="empty-state">Нет сделок, готовых к созданию proposal.</div>
      ) : (
        <div className="list-stack">
          {surveyReadyDeals.map((deal) => (
            <div key={deal.deal_id} className="proposal-ready-card">
              <div>
                <div className="row-title">{deal.title}</div>
                <div className="row-meta">
                  {deal.deal_code ?? "Без кода"} · {deal.client?.name ?? "Без клиента"}
                </div>
                <div className="row-meta">
                  Survey: {deal.latest_completed_survey?.title ?? "не найден"} · existing proposals:{" "}
                  {deal.proposals_count}
                </div>
              </div>

              <button
                type="button"
                className="accent-button"
                onClick={() => handleCreate(deal)}
                disabled={pendingDealId !== null}
              >
                {pendingDealId === deal.deal_id ? "Создание..." : "Создать proposal"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row-meta">{message}</div>
    </section>
  );
}
