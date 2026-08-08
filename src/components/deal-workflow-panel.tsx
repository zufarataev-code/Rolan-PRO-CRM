"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

type ConsultantOption = {
  user_id: string;
  full_name: string;
};

type DealWorkflowPanelProps = {
  deal: any;
  consultants: ConsultantOption[];
};

type ApiEnvelope = {
  data?: Record<string, any>;
  errors?: Array<{
    message?: string;
  }>;
};

function formatCurrency(value: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "Не задано";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Не задано" : date.toLocaleString("ru-RU");
}

function isoInputValue(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(
    value.getMinutes(),
  )}`;
}

async function parseEnvelope(response: Response) {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message ?? "Request failed.");
  }

  return payload.data;
}

function WorkflowCard(props: {
  title: string;
  status: string;
  detail: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="surface">
      <div className="detail-hero">
        <div>
          <h3 className="surface-title">{props.title}</h3>
          <p className="surface-subtitle">{props.detail}</p>
        </div>
        <div className="chip chip-accent">{props.status}</div>
      </div>
      {props.children}
      {props.actions ? <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>{props.actions}</div> : null}
    </section>
  );
}

export function DealWorkflowPanel({ deal, consultants }: DealWorkflowPanelProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Все ключевые manager actions теперь собираются вокруг сделки.");
  const [consultantId, setConsultantId] = useState(consultants[0]?.user_id ?? "");
  const [scheduledStart, setScheduledStart] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    return isoInputValue(date);
  });
  const [scheduledEnd, setScheduledEnd] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(11, 0, 0, 0);
    return isoInputValue(date);
  });
  const [consultationAddress, setConsultationAddress] = useState(
    deal.client?.service_address ?? deal.client?.billing_address ?? deal.workflow?.latest_consultation?.location_address ?? "",
  );
  const [consultationNotes, setConsultationNotes] = useState(deal.notes ?? "");

  const latestConsultation = deal.workflow?.latest_consultation ?? null;
  const latestSurvey = latestConsultation?.survey ?? null;
  const latestProposal = deal.workflow?.latest_proposal ?? null;
  const latestDeposit = latestProposal?.deposit ?? null;
  const latestProject = deal.workflow?.latest_project ?? latestProposal?.project ?? null;
  const latestProjectStatusCode = latestProject?.project_status?.status_code ?? null;

  const canCreateClientFromLead = Boolean(!deal.client && deal.lead?.lead_id && deal.lead?.name);
  const canScheduleConsultation = Boolean(consultantId);
  const canCreateProposal = Boolean(deal.client?.client_id && latestSurvey?.status === "completed" && !latestProposal);
  const canSendProposal = Boolean(latestProposal && latestProposal.status === "draft");
  const canApproveProposal = Boolean(latestProposal && latestProposal.status !== "approved" && latestProposal.status !== "finalized");
  const canCreateDeposit = Boolean(latestProposal && latestProposal.status === "approved" && !latestDeposit);
  const canMarkDepositPaid = Boolean(latestDeposit && latestDeposit.status === "pending");
  const canCreateProject = Boolean(latestProposal && latestDeposit?.status === "paid" && !latestProject?.project_id);
  const canAssignInstallation = Boolean(
    latestProject?.project_id &&
      (["PROJECT_CREATED", "SCHEDULED"].includes(deal.pipeline_status?.status_code ?? "") ||
        ["PROJECT_CREATED", "SCHEDULED"].includes(latestProjectStatusCode ?? "")),
  );

  const consultationTitle = useMemo(() => {
    if (deal.client?.name) {
      return `${deal.client.name} · консультация`;
    }

    if (deal.lead?.name) {
      return `${deal.lead.name} · консультация`;
    }

    return `${deal.title} · консультация`;
  }, [deal.client?.name, deal.lead?.name, deal.title]);

  async function runAction(
    label: string,
    action: () => Promise<void>,
    options?: {
      redirectTo?: string;
    },
  ) {
    setSaving(true);
    setMessage(label);

    try {
      await action();
      if (options?.redirectTo) {
        router.push(options.redirectTo);
      } else {
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Операция не выполнена.");
    } finally {
      setSaving(false);
    }
  }

  async function createClientFromLead() {
    if (!deal.lead?.name) {
      throw new Error("Для этой сделки нет лида, из которого можно создать клиента.");
    }

    const createdClient = await parseEnvelope(
      await fetch("/api/v1/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: deal.lead.name,
          phone: deal.lead.phone ?? null,
          email: deal.lead.email ?? null,
          service_address: consultationAddress.trim() || null,
          notes: `Создано из лида ${deal.lead.lead_code ?? deal.lead.name}.`,
        }),
      }),
    );

    await parseEnvelope(
      await fetch(`/api/v1/deals/${deal.deal_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: createdClient.client_id,
        }),
      }),
    );

    setMessage("Клиент создан из лида и привязан к сделке.");
  }

  async function scheduleConsultation() {
    if (!consultantId) {
      throw new Error("Выберите консультанта.");
    }

    await parseEnvelope(
      await fetch("/api/v1/consultations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: consultationTitle,
          assigned_consultant_id: consultantId,
          assigned_manager_id: deal.assigned_manager?.user_id ?? null,
          lead_id: deal.lead?.lead_id ?? null,
          deal_id: deal.deal_id,
          client_id: deal.client?.client_id ?? null,
          location_address: consultationAddress.trim() || null,
          manager_notes: consultationNotes.trim() || null,
          scheduled_start_at: new Date(scheduledStart).toISOString(),
          scheduled_end_at: new Date(scheduledEnd).toISOString(),
        }),
      }),
    );

    setMessage("Консультация назначена и связана со сделкой.");
  }

  async function createProposal() {
    const data = await parseEnvelope(
      await fetch("/api/v1/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deal_id: deal.deal_id,
          survey_id: latestSurvey?.survey_id ?? null,
        }),
      }),
    );

    setMessage("Proposal создан из survey и привязан к сделке.");
    router.push(`/manager/crm/proposals/${data.proposal.proposal_id}`);
  }

  async function sendProposal() {
    await parseEnvelope(
      await fetch(`/api/v1/proposals/${latestProposal.proposal_id}/send`, {
        method: "POST",
      }),
    );

    setMessage("Proposal отправлен клиенту.");
  }

  async function approveProposal() {
    await parseEnvelope(
      await fetch(`/api/v1/proposals/${latestProposal.proposal_id}/approve`, {
        method: "POST",
      }),
    );

    setMessage("Proposal approved.");
  }

  async function createDeposit() {
    await parseEnvelope(
      await fetch("/api/v1/deposits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proposal_id: latestProposal.proposal_id,
        }),
      }),
    );

    setMessage("Deposit создан.");
  }

  async function markDepositPaid() {
    await parseEnvelope(
      await fetch(`/api/v1/deposits/${latestDeposit.deposit_id}/pay`, {
        method: "POST",
      }),
    );

    setMessage("Deposit отмечен как paid.");
  }

  async function createProject() {
    const data = await parseEnvelope(
      await fetch("/api/v1/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proposal_id: latestProposal.proposal_id,
        }),
      }),
    );

    setMessage("Project создан из сделки.");
    router.push(`/manager/projects/${data.project.project_id}`);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <WorkflowCard
        title="Client"
        status={deal.client ? "LINKED" : "PENDING"}
        detail={
          deal.client
            ? `${deal.client.name} · ${deal.client.phone ?? "без телефона"}`
            : "Сделка пока без клиента. Следующий шаг менеджера — привязать клиента."
        }
        actions={
          <>
            {deal.client ? (
              <Link href="/manager/crm/clients" className="soft-button">
                Открыть клиентов
              </Link>
            ) : canCreateClientFromLead ? (
              <button
                type="button"
                className="accent-button"
                onClick={() => runAction("Создаю клиента из лида...", createClientFromLead)}
                disabled={saving}
              >
                Создать клиента из лида
              </button>
            ) : (
              <Link href="/manager/crm/clients#new-client" className="accent-button">
                Создать клиента
              </Link>
            )}
          </>
        }
      >
        <div className="inspector-list">
          <div className="inspector-item">
            <div className="row-title">Lead</div>
            <div className="row-meta">{deal.lead?.name ?? "Нет связанного лида"}</div>
          </div>
          <div className="inspector-item">
            <div className="row-title">Адрес сервиса</div>
            <div className="row-meta">{deal.client?.service_address ?? consultationAddress ?? "Не указан"}</div>
          </div>
        </div>
      </WorkflowCard>

      <WorkflowCard
        title="Consultation"
        status={latestConsultation ? latestConsultation.status : "NOT_SCHEDULED"}
        detail={
          latestConsultation
            ? `${latestConsultation.assigned_consultant?.full_name ?? "без консультанта"} · ${formatDateTime(
                latestConsultation.scheduled_start_at,
              )}`
            : "Назначьте консультацию прямо из сделки. Если клиент прислал размеры сам, менеджер потом заполнит survey и соберет КП."
        }
        actions={
          <>
            <button
              type="button"
              className="accent-button"
              onClick={() => runAction("Назначаю консультацию...", scheduleConsultation)}
              disabled={saving || !canScheduleConsultation}
            >
              {latestConsultation ? "Переназначить консультацию" : "Назначить консультацию"}
            </button>
            {latestConsultation ? (
              <Link href={`/manager/crm/consultations/${latestConsultation.consultation_id}`} className="soft-button">
                Открыть consultation
              </Link>
            ) : null}
            {latestConsultation ? (
              <Link
                href={`/manager/crm/consultations/${latestConsultation.consultation_id}#workspace`}
                className="soft-button"
              >
                Добавить размеры
              </Link>
            ) : null}
          </>
        }
      >
        <div className="proposal-item-grid">
          <label className="calculator-field">
            <span>Консультант</span>
            <select value={consultantId} onChange={(event) => setConsultantId(event.target.value)} disabled={saving}>
              <option value="">Выберите консультанта</option>
              {consultants.map((consultant) => (
                <option key={consultant.user_id} value={consultant.user_id}>
                  {consultant.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="calculator-field">
            <span>Start</span>
            <input
              type="datetime-local"
              value={scheduledStart}
              onChange={(event) => setScheduledStart(event.target.value)}
              disabled={saving}
            />
          </label>

          <label className="calculator-field">
            <span>End</span>
            <input
              type="datetime-local"
              value={scheduledEnd}
              onChange={(event) => setScheduledEnd(event.target.value)}
              disabled={saving}
            />
          </label>
        </div>

        <label className="calculator-notes">
          <span>Адрес</span>
          <textarea rows={2} value={consultationAddress} onChange={(event) => setConsultationAddress(event.target.value)} />
        </label>

        <label className="calculator-notes">
          <span>Manager notes</span>
          <textarea rows={2} value={consultationNotes} onChange={(event) => setConsultationNotes(event.target.value)} />
        </label>
      </WorkflowCard>

      <WorkflowCard
        title="Survey"
        status={latestSurvey ? latestSurvey.status : "WAITING"}
        detail={
          latestSurvey
            ? `${latestSurvey.counts.measurements} замеров · ${latestSurvey.counts.recommendations} рекомендаций`
            : "Survey появится после назначения консультации. Менеджер тоже может заполнить размеры вручную, если клиент прислал их заранее."
        }
        actions={
          <>
            {latestConsultation ? (
              <Link
                href={`/manager/crm/consultations/${latestConsultation.consultation_id}#workspace`}
                className="accent-button"
              >
                {latestSurvey ? "Добавить / изменить размеры" : "Заполнить survey"}
              </Link>
            ) : null}
            {latestConsultation ? (
              <Link href={`/manager/crm/consultations/${latestConsultation.consultation_id}`} className="soft-button">
                {latestSurvey ? "Открыть survey card" : "Открыть consultation"}
              </Link>
            ) : null}
          </>
        }
      >
        {latestSurvey ? (
          <div className="detail-meta">
            <span>Completed: {formatDateTime(latestSurvey.completed_at)}</span>
            <span>Файлы: {latestSurvey.counts.files}</span>
            <span>Источник: survey внутри сделки</span>
          </div>
        ) : latestConsultation ? (
          <div className="detail-meta">
            <span>Если клиент прислал размеры в чат или по почте, менеджер может занести их сам.</span>
          </div>
        ) : null}
      </WorkflowCard>

      <WorkflowCard
        title="Calculator"
        status="DEAL_CONTEXT"
        detail="Калькулятор должен открываться в контексте сделки и survey, а не как отдельный мир."
        actions={
          <Link href={`/manager/crm/calculator?deal_id=${deal.deal_id}`} className="accent-button">
            Открыть калькулятор
          </Link>
        }
      />

      <WorkflowCard
        title="Proposal"
        status={latestProposal ? latestProposal.status : "NOT_CREATED"}
        detail={
          latestProposal
            ? `${formatCurrency(latestProposal.selected_total_amount, latestProposal.currency)} · ${
                latestProposal.agreement?.status ?? "agreement pending"
              }`
            : "После completed survey менеджер собирает proposal внутри сделки."
        }
        actions={
          <>
            {!latestProposal && canCreateProposal ? (
              <button type="button" className="accent-button" onClick={() => runAction("Создаю proposal...", createProposal)} disabled={saving}>
                Создать предложение
              </button>
            ) : null}
            {latestProposal ? (
              <Link href={`/manager/crm/proposals/${latestProposal.proposal_id}`} className="soft-button">
                Открыть proposal
              </Link>
            ) : null}
            {canSendProposal ? (
              <button type="button" className="soft-button" onClick={() => runAction("Отправляю proposal...", sendProposal)} disabled={saving}>
                Отправить предложение
              </button>
            ) : null}
            {canApproveProposal ? (
              <button type="button" className="soft-button" onClick={() => runAction("Approve proposal...", approveProposal)} disabled={saving}>
                Approve proposal
              </button>
            ) : null}
          </>
        }
      >
        {latestProposal ? (
          <div className="detail-meta">
            <span>Sent: {formatDateTime(latestProposal.sent_at)}</span>
            <span>Survey: {latestProposal.survey_id ?? "manual"}</span>
          </div>
        ) : null}
      </WorkflowCard>

      <WorkflowCard
        title="Deposit"
        status={latestDeposit ? latestDeposit.status : "NOT_CREATED"}
        detail={
          latestDeposit
            ? `${formatCurrency(latestDeposit.amount, latestProposal?.currency ?? "USD")} · paid ${formatDateTime(
                latestDeposit.paid_at,
              )}`
            : "Deposit создается после approved proposal."
        }
        actions={
          <>
            {canCreateDeposit ? (
              <button type="button" className="accent-button" onClick={() => runAction("Создаю deposit...", createDeposit)} disabled={saving}>
                Создать deposit
              </button>
            ) : null}
            {canMarkDepositPaid ? (
              <button type="button" className="soft-button" onClick={() => runAction("Фиксирую deposit paid...", markDepositPaid)} disabled={saving}>
                Отметить paid
              </button>
            ) : null}
          </>
        }
      />

      <WorkflowCard
        title="Project"
        status={latestProject?.project_status?.status_code ?? (latestProject?.project_id ? "CREATED" : "NOT_CREATED")}
        detail={
          latestProject
            ? `${latestProject.project_code ?? latestProject.project_id} · ${latestProject.title}`
            : "Project создается только после approved proposal и paid deposit."
        }
        actions={
          <>
            {canCreateProject ? (
              <button type="button" className="accent-button" onClick={() => runAction("Создаю project...", createProject)} disabled={saving}>
                Создать проект
              </button>
            ) : null}
            {latestProject?.project_id ? (
              <Link href={`/manager/projects/${latestProject.project_id}`} className="soft-button">
                Открыть project
              </Link>
            ) : null}
            {canAssignInstallation ? (
              <Link href={`/manager/projects/${latestProject.project_id}#assignment`} className="accent-button">
                {latestProjectStatusCode === "SCHEDULED" ? "+ Изменить монтаж" : "+ Назначить монтаж"}
              </Link>
            ) : null}
          </>
        }
      >
        <div className="inspector-list">
          <div className="inspector-item">
            <div className="row-title">Статус воронки</div>
            <div className="row-meta">{deal.pipeline_status.name_ru}</div>
          </div>
          <div className="inspector-item">
            <div className="row-title">Монтаж</div>
            <div className="row-meta">
              {latestProject?.project_id
                ? canAssignInstallation
                  ? "Менеджер может открыть назначение монтажа, добавить монтажников и сохранить schedule."
                  : "Назначение монтажа станет доступно, когда project выйдет в этап Project Created / Scheduled."
                : "Сначала нужно создать project из approved proposal и paid deposit."}
            </div>
          </div>
        </div>
      </WorkflowCard>

      <section className="surface">
        <h3 className="surface-title">Workflow status</h3>
        <div className="row-meta">{message}</div>
      </section>
    </div>
  );
}
