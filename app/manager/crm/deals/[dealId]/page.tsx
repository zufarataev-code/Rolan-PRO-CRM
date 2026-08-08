import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DealWorkflowPanel } from "@/components/deal-workflow-panel";
import { ManagerShell } from "@/components/manager-shell";
import { getDealCardData } from "@/features/sales/server-api";
import { listConsultantOptions } from "@/features/sales/service";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

type PageProps = {
  params: Promise<{
    dealId: string;
  }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "Без срока";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Без срока" : date.toLocaleString("ru-RU");
}

function isOverdue(value: string | Date | null | undefined) {
  if (!value) {
    return false;
  }

  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export default async function DealCardPage({ params }: PageProps) {
  const session = await requireAppSession([ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);

  if (!session) {
    redirect("/");
  }

  const { dealId } = await params;
  const [deal, consultants] = await Promise.all([
    getDealCardData(dealId).catch(() => null),
    listConsultantOptions(),
  ]);

  if (!deal) {
    notFound();
  }

  return (
    <ManagerShell
      title="Карточка сделки"
      subtitle="Единый manager command center: client, consultation, survey, calculator, proposal, deposit и project."
      kicker="Сделка"
      activeHref={`/manager/crm/deals/${deal.deal_id}`}
      actions={
        <>
          <Link href="/manager/crm/pipeline" className="soft-button">
            Назад в воронку
          </Link>
          <div className="chip chip-accent">{deal.pipeline_status.name_ru}</div>
        </>
      }
    >
      <section className="detail-grid">
        <div className="detail-band">
          <section className="surface">
            <div className="detail-hero">
              <div>
                <div className="page-kicker mono">{deal.deal_code}</div>
                <h2 className="detail-heading">{deal.title}</h2>
                <div className="detail-meta">
                  <span>{deal.pipeline_status.name_ru}</span>
                  <span>{deal.lead?.source ?? "Без source"}</span>
                  <span>Manager: {deal.assigned_manager?.full_name ?? "не назначен"}</span>
                  {deal.status_flags?.is_new ? <span>new</span> : null}
                  {deal.status_flags?.needs_attention ? <span>attention</span> : null}
                </div>
              </div>
              <div className="chip chip-accent">{formatCurrency(deal.estimated_value)}</div>
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Sales signals</h3>
            <div className="inspector-list">
              <div className="inspector-item">
                <div className="row-title">Next follow-up</div>
                <div className="row-meta">
                  {deal.next_follow_up
                    ? `${deal.next_follow_up.type_key} · ${formatDateTime(deal.next_follow_up.due_at)}`
                    : "Не назначен"}
                </div>
                {deal.next_follow_up?.due_at && isOverdue(deal.next_follow_up.due_at) ? (
                  <div className="row-meta project-warning">Overdue</div>
                ) : null}
              </div>
              <div className="inspector-item">
                <div className="row-title">Tasks</div>
                <div className="row-meta">
                  {deal.task_summary.open} открытых из {deal.task_summary.total}
                </div>
              </div>
              <div className="inspector-item">
                <div className="row-title">Projects</div>
                <div className="row-meta">{deal.project_summary.total} связанных карточек</div>
              </div>
            </div>
          </section>

          <DealWorkflowPanel deal={deal} consultants={consultants} />

          <section className="surface">
            <h3 className="surface-title">Activity log</h3>
            <div className="list-stack">
              {deal.activity?.length ? (
                deal.activity.map((item: any) => (
                  <div key={item.activity_id} className="list-row">
                    <div className="chip chip-success">Log</div>
                    <div className="row-title">{item.message}</div>
                    <span className="row-meta">{formatDateTime(item.created_at)}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Лог по сделке пока пуст.</div>
              )}
            </div>
          </section>
        </div>

        <div className="detail-band">
          <section className="surface">
            <h3 className="surface-title">Контекст лида</h3>
            <div className="inspector-list">
              <div className="inspector-item">
                <div className="row-title">{deal.lead?.name ?? "Без лида"}</div>
                <div className="row-meta mono">{deal.lead?.phone ?? "нет телефона"}</div>
                <div className="row-meta">{deal.lead?.email ?? "нет email"}</div>
              </div>
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Контекст клиента</h3>
            <div className="inspector-list">
              <div className="inspector-item">
                <div className="row-title">{deal.client?.name ?? "Без клиента"}</div>
                <div className="row-meta mono">{deal.client?.phone ?? "нет телефона"}</div>
                <div className="row-meta">{deal.client?.email ?? "нет email"}</div>
              </div>
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Follow Ups</h3>
            <div className="inspector-list">
              {deal.follow_ups.length ? (
                deal.follow_ups.map((item: any) => (
                  <div key={item.follow_up_id} className="inspector-item">
                    <div className="row-title">{item.type_key}</div>
                    <div className="row-meta">{formatDateTime(item.due_at)}</div>
                    <div className="row-meta">{item.notes ?? "Без notes"}</div>
                    {item.is_overdue ? <div className="row-meta project-warning">overdue</div> : null}
                  </div>
                ))
              ) : (
                <div className="empty-state">Follow-ups пока не добавлены.</div>
              )}
            </div>
          </section>

          <section className="surface">
            <h3 className="surface-title">Tasks</h3>
            <div className="inspector-list">
              {deal.tasks.length ? (
                deal.tasks.map((item: any) => (
                  <div key={item.task_id} className="inspector-item">
                    <div className="row-title">{item.title}</div>
                    <div className="row-meta">
                      {item.status} · {item.priority}
                    </div>
                    <div className="row-meta">{item.description ?? "Без описания"}</div>
                    {item.is_overdue ? <div className="row-meta project-warning">overdue</div> : null}
                  </div>
                ))
              ) : (
                <div className="empty-state">Tasks пока не добавлены.</div>
              )}
            </div>
          </section>
        </div>
      </section>
    </ManagerShell>
  );
}
