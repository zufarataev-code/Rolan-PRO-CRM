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
  const [message, setMessage] = useState("Менеджер ведёт клиента до закрытия продажи, затем отдельно запускает проект.");
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
  const agreementSigned = Boolean(
    latestProposal?.agreement?.status === "signed" && latestProposal?.agreement?.signed_at,
  );
  const depositPaid = Boolean(latestDeposit?.status === "paid" && latestDeposit?.paid_at);
  const saleClosed = deal.pipeline_status?.status_code === "CLOSED_WON";

  const canCreateClientFromLead = Boolean(!deal.client && deal.lead?.lead_id && deal.lead?.name);
  const canScheduleConsultation = Boolean(consultantId);
  const canCreateProposal = Boolean(deal.client?.client_id && latestSurvey?.status === "completed" && !latestProposal);
  const canSendProposal = Boolean(latestProposal && latestProposal.status === "draft");
  const canApproveProposal = Boolean(latestProposal && latestProposal.status !== "approved" && latestProposal.status !== "finalized");
  const canCreateDeposit = Boolean(latestProposal && latestProposal.status === "approved" && !latestDeposit);
  const canMarkDepositPaid = Boolean(latestDeposit && latestDeposit.status === "pending");
  const canLaunchProject = Boolean(
    latestProposal && agreementSigned && depositPaid && saleClosed && !latestProject?.project_id,
  );
  const canAssignInstallation = Boolean(
    latestProject?.project_id && ["PROJECT_CREATED", "SCHEDULED", "IN_PROGRESS"].includes(latestProjectStatusCode ?? ""),
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

    setMessage("КП создано из замера и привязано к сделке.");
    router.push(`/manager/crm/proposals/${data.proposal.proposal_id}`);
  }

  async function sendProposal() {
    await parseEnvelope(
      await fetch(`/api/v1/proposals/${latestProposal.proposal_id}/send`, {
        method: "POST",
      }),
    );

    setMessage("КП, договор и клиентский пакет отправлены.");
  }

  async function approveProposal() {
    await parseEnvelope(
      await fetch(`/api/v1/proposals/${latestProposal.proposal_id}/approve`, {
        method: "POST",
      }),
    );

    setMessage("КП согласовано.");
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

    setMessage("Счёт на аванс подготовлен.");
  }

  async function markDepositPaid() {
    await parseEnvelope(
      await fetch(`/api/v1/deposits/${latestDeposit.deposit_id}/pay`, {
        method: "POST",
      }),
    );

    setMessage("Аванс отмечен как оплаченный.");
  }

  async function launchProject() {
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

    setMessage("Проект запущен. PRJ-номер присвоен.");
    router.push(`/manager/projects/${data.project.project_id}`);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <WorkflowCard
        title="Клиент"
        status={deal.client ? "ПРИВЯЗАН" : "ОЖИДАЕТ"}
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
            <div className="row-title">Лид</div>
            <div className="row-meta">{deal.lead?.name ?? "Нет связанного лида"}</div>
          </div>
          <div className="inspector-item">
            <div className="row-title">Адрес объекта</div>
            <div className="row-meta">{deal.client?.service_address ?? consultationAddress ?? "Не указан"}</div>
          </div>
        </div>
      </WorkflowCard>

      <WorkflowCard
        title="Замер"
        status={latestConsultation ? latestConsultation.status : "НЕ НАЗНАЧЕН"}
        detail={
          latestConsultation
            ? `${latestConsultation.assigned_consultant?.full_name ?? "без замерщика"} · ${formatDateTime(
                latestConsultation.scheduled_start_at,
              )}`
            : "Назначьте замер или внесите размеры, которые клиент прислал менеджеру."
        }
        actions={
          <>
            <button
              type="button"
              className="accent-button"
              onClick={() => runAction("Назначаю замер...", scheduleConsultation)}
              disabled={saving || !canScheduleConsultation}
            >
              {latestConsultation ? "Переназначить замер" : "Назначить замер"}
            </button>
            {latestConsultation ? (
              <Link href={`/manager/crm/consultations/${latestConsultation.consultation_id}#workspace`} className="soft-button">
                Добавить / изменить размеры
              </Link>
            ) : null}
          </>
        }
      >
        <div className="proposal-item-grid">
          <label className="calculator-field">
            <span>Исполнитель замера</span>
            <select value={consultantId} onChange={(event) => setConsultantId(event.target.value)} disabled={saving}>
              <option value="">Выберите сотрудника</option>
              {consultants.map((consultant) => (
                <option key={consultant.user_id} value={consultant.user_id}>
                  {consultant.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="calculator-field">
            <span>Начало</span>
            <input
              type="datetime-local"
              value={scheduledStart}
              onChange={(event) => setScheduledStart(event.target.value)}
              disabled={saving}
            />
          </label>

          <label className="calculator-field">
            <span>Конец</span>
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
          <span>Комментарий менеджера</span>
          <textarea rows={2} value={consultationNotes} onChange={(event) => setConsultationNotes(event.target.value)} />
        </label>

        {latestSurvey ? (
          <div className="detail-meta" style={{ marginTop: 12 }}>
            <span>Замеров: {latestSurvey.counts.measurements}</span>
            <span>Рекомендаций: {latestSurvey.counts.recommendations}</span>
            <span>Завершено: {formatDateTime(latestSurvey.completed_at)}</span>
          </div>
        ) : null}
      </WorkflowCard>

      <WorkflowCard
        title="КП и договор"
        status={latestProposal ? latestProposal.status : "НЕ СОЗДАНО"}
        detail={
          latestProposal
            ? `${formatCurrency(latestProposal.selected_total_amount, latestProposal.currency)} · договор ${
                agreementSigned ? "подписан" : "ожидает подписи"
              }`
            : "После замера менеджер формирует КП. Клиент получает КП, договор, гарантийные условия и варианты оплаты одним пакетом."
        }
        actions={
          <>
            {!latestProposal && canCreateProposal ? (
              <button type="button" className="accent-button" onClick={() => runAction("Создаю КП...", createProposal)} disabled={saving}>
                Создать КП
              </button>
            ) : null}
            {latestProposal ? (
              <Link href={`/manager/crm/proposals/${latestProposal.proposal_id}`} className="soft-button">
                Открыть КП
              </Link>
            ) : null}
            {canSendProposal ? (
              <button type="button" className="soft-button" onClick={() => runAction("Отправляю пакет клиенту...", sendProposal)} disabled={saving}>
                Отправить КП + договор
              </button>
            ) : null}
            {canApproveProposal ? (
              <button type="button" className="soft-button" onClick={() => runAction("Согласовываю КП...", approveProposal)} disabled={saving}>
                Отметить КП согласованным
              </button>
            ) : null}
          </>
        }
      >
        {latestProposal ? (
          <div className="detail-meta">
            <span>Отправлено: {formatDateTime(latestProposal.sent_at)}</span>
            <span>Договор: {agreementSigned ? formatDateTime(latestProposal.agreement?.signed_at) : "не подписан"}</span>
          </div>
        ) : null}
      </WorkflowCard>

      <WorkflowCard
        title="Аванс"
        status={latestDeposit ? latestDeposit.status : "НЕ СОЗДАН"}
        detail={
          latestDeposit
            ? `${formatCurrency(latestDeposit.amount, latestProposal?.currency ?? "USD")} · ${
                depositPaid ? `оплачен ${formatDateTime(latestDeposit.paid_at)}` : "ожидает оплаты"
              }`
            : "После согласования КП создаётся аванс. Zelle / bank transfer — без processing fee; online payment — +3.5%."
        }
        actions={
          <>
            {canCreateDeposit ? (
              <button type="button" className="accent-button" onClick={() => runAction("Создаю аванс...", createDeposit)} disabled={saving}>
                Создать аванс
              </button>
            ) : null}
            {canMarkDepositPaid ? (
              <button type="button" className="soft-button" onClick={() => runAction("Фиксирую оплату аванса...", markDepositPaid)} disabled={saving}>
                Отметить аванс оплаченным
              </button>
            ) : null}
          </>
        }
      />

      <WorkflowCard
        title="Закрытие продажи → запуск проекта"
        status={latestProject?.project_status?.status_code ?? (saleClosed ? "CLOSED_WON" : "ПРОДАЖА")}
        detail={
          latestProject
            ? `${latestProject.project_code ?? latestProject.project_id} · ${latestProject.title}`
            : canLaunchProject
              ? "Договор подписан и аванс оплачен. Продажа закрыта — проект готов к запуску."
              : "До запуска это лид/сделка. PRJ-номер появится только после подписанного договора, оплаченного аванса и закрытия продажи."
        }
        actions={
          <>
            {canLaunchProject ? (
              <button type="button" className="accent-button" onClick={() => runAction("Запускаю проект...", launchProject)} disabled={saving}>
                Запустить проект
              </button>
            ) : null}
            {latestProject?.project_id ? (
              <Link href={`/manager/projects/${latestProject.project_id}`} className="soft-button">
                Открыть проект
              </Link>
            ) : null}
            {canAssignInstallation ? (
              <Link href={`/manager/projects/${latestProject.project_id}#assignment`} className="accent-button">
                + Этап монтажа / исполнители
              </Link>
            ) : null}
          </>
        }
      >
        <div className="inspector-list">
          <div className="inspector-item">
            <div className="row-title">Договор</div>
            <div className="row-meta">{agreementSigned ? "✓ Подписан" : "Ожидает подписи"}</div>
          </div>
          <div className="inspector-item">
            <div className="row-title">Аванс</div>
            <div className="row-meta">{depositPaid ? "✓ Оплачен" : "Ожидает оплаты"}</div>
          </div>
          <div className="inspector-item">
            <div className="row-title">Продажа</div>
            <div className="row-meta">{saleClosed ? "✓ CLOSED_WON" : "Ещё в работе с клиентом"}</div>
          </div>
          <div className="inspector-item">
            <div className="row-title">Проект</div>
            <div className="row-meta">
              {latestProject?.project_id
                ? `✓ Запущен ${latestProject.project_code ?? latestProject.project_id}`
                : "Не создан — PRJ-номер отсутствует"}
            </div>
          </div>
        </div>
      </WorkflowCard>

      <section className="surface">
        <h3 className="surface-title">Статус действий</h3>
        <div className="row-meta">{message}</div>
      </section>
    </div>
  );
}
