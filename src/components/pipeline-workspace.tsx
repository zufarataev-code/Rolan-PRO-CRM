"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  PIPELINE_MACRO_STAGES,
  TERMINAL_PIPELINE_STATUSES,
  getAllowedTargetStatuses,
  getPipelineStatusLabel,
} from "@/features/sales/pipeline-view";

type PipelineDeal = {
  deal_id: string;
  deal_code: string | null;
  title: string;
  estimated_value: number;
  currency: string;
  lead: {
    name: string;
    source: string | null;
  } | null;
  client: {
    name: string;
  } | null;
  assigned_manager: {
    full_name: string;
  } | null;
  pipeline_status: {
    status_code: string;
  };
  allowed_next: string[];
  next_follow_up: {
    type_key: string;
    due_at: string;
  } | null;
  task_summary: {
    total: number;
    open: number;
  };
  status_flags: {
    is_new: boolean;
    overdue_follow_ups: number;
    overdue_tasks: number;
    needs_attention: boolean;
  };
};

type PipelineColumn = {
  pipeline_status_id: string;
  status_code: string;
  deals: PipelineDeal[];
};

type PipelineWorkspaceProps = {
  columns: PipelineColumn[];
};

type ApiEnvelope = {
  data?: Record<string, unknown> | null;
  errors?: Array<{
    message?: string;
  }>;
};

const FOLLOW_UP_OPTIONS = [
  { value: "call", label: "Позвонить" },
  { value: "proposal_review_call", label: "Обсудить КП" },
  { value: "email", label: "Отправить email" },
  { value: "sms", label: "Отправить SMS" },
  { value: "deposit_reminder", label: "Напомнить об авансе" },
  { value: "site_follow_up", label: "Связаться после выезда" },
] as const;

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Не назначено";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Не назначено"
    : new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function formatFollowUpType(value: string) {
  return FOLLOW_UP_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function tomorrowInputValue() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(10, 0, 0, 0);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("ru-RU") ?? "";
}

export function PipelineWorkspace({ columns }: PipelineWorkspaceProps) {
  const router = useRouter();
  const allDeals = useMemo(() => columns.flatMap((column) => column.deals), [columns]);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [signal, setSignal] = useState("all");
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dropStageKey, setDropStageKey] = useState<string | null>(null);
  const [actionDealId, setActionDealId] = useState<string | null>(null);
  const [nextStatusCode, setNextStatusCode] = useState("");
  const [nextActionType, setNextActionType] = useState("call");
  const [nextActionDueAt, setNextActionDueAt] = useState(tomorrowInputValue);
  const [nextActionNotes, setNextActionNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Перетащите карточку или нажмите «Сменить этап».");

  const sources = useMemo(
    () =>
      Array.from(new Set(allDeals.map((deal) => deal.lead?.source).filter((value): value is string => Boolean(value))))
        .sort((left, right) => left.localeCompare(right, "ru-RU")),
    [allDeals],
  );

  const filteredDeals = useMemo(() => {
    const normalizedQuery = normalize(query);
    return allDeals.filter((deal) => {
      const matchesQuery =
        !normalizedQuery ||
        [deal.title, deal.deal_code, deal.client?.name, deal.lead?.name, deal.lead?.source]
          .map(normalize)
          .some((value) => value.includes(normalizedQuery));
      const matchesSource = source === "all" || deal.lead?.source === source;
      const matchesSignal =
        signal === "all" ||
        (signal === "overdue" && deal.status_flags.needs_attention) ||
        (signal === "no_next" && !deal.next_follow_up);
      return matchesQuery && matchesSource && matchesSignal;
    });
  }, [allDeals, query, signal, source]);

  const groupedStages = useMemo(
    () =>
      PIPELINE_MACRO_STAGES.map((stage) => ({
        ...stage,
        deals: filteredDeals.filter((deal) => stage.statusCodes.includes(deal.pipeline_status.status_code)),
      })),
    [filteredDeals],
  );

  const selectedDeal = allDeals.find((deal) => deal.deal_id === actionDealId) ?? null;
  const isTerminalMove = TERMINAL_PIPELINE_STATUSES.has(nextStatusCode);
  const filteredValue = filteredDeals.reduce((sum, deal) => sum + deal.estimated_value, 0);
  const overdueCount = filteredDeals.filter((deal) => deal.status_flags.needs_attention).length;
  const missingNextCount = filteredDeals.filter((deal) => !deal.next_follow_up).length;

  function openStageAction(deal: PipelineDeal, allowedStatuses: string[] = deal.allowed_next) {
    if (!allowedStatuses.length) {
      setMessage("Для этой сделки нет разрешённого следующего этапа.");
      return;
    }

    setActionDealId(deal.deal_id);
    setNextStatusCode(allowedStatuses[0]);
    setNextActionType("call");
    setNextActionDueAt(tomorrowInputValue());
    setNextActionNotes("");
    setMessage(`Выберите следующий этап для «${deal.title}».`);
    window.requestAnimationFrame(() => {
      document.getElementById("pipeline-stage-action")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function handleDrop(targetStageKey: string) {
    const deal = allDeals.find((item) => item.deal_id === draggedDealId);
    setDraggedDealId(null);
    setDropStageKey(null);
    if (!deal) {
      return;
    }

    const allowedStatuses = getAllowedTargetStatuses(deal.pipeline_status.status_code, targetStageKey);
    if (!allowedStatuses.length) {
      setMessage("Этот этап нельзя пропустить. Переводите сделку последовательно.");
      return;
    }

    openStageAction(deal, allowedStatuses);
  }

  async function submitStageAction() {
    if (!selectedDeal || !nextStatusCode) {
      return;
    }

    if (!isTerminalMove && !nextActionDueAt) {
      setMessage("Укажите дату следующего действия.");
      return;
    }

    setSaving(true);
    setMessage("Сохраняю этап и следующее действие…");

    try {
      const response = await fetch(`/api/v1/deals/${selectedDeal.deal_id}/stage`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          next_status_code: nextStatusCode,
          next_action: isTerminalMove
            ? null
            : {
                type_key: nextActionType,
                due_at: new Date(nextActionDueAt).toISOString(),
                notes: nextActionNotes.trim() || null,
              },
        }),
      });
      const payload = (await response.json().catch(() => null)) as ApiEnvelope | null;

      if (!response.ok || !payload?.data) {
        throw new Error(payload?.errors?.[0]?.message ?? "Не удалось изменить этап.");
      }

      setMessage(`«${selectedDeal.title}» переведена в этап «${getPipelineStatusLabel(nextStatusCode)}».`);
      setActionDealId(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить этап.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pipeline-workspace">
      <section className="pipeline-control-surface" aria-label="Управление воронкой">
        <div className="pipeline-control-head">
          <div>
            <h2 className="surface-title">Контроль продаж</h2>
            <p className="surface-subtitle">8 рабочих этапов. Технические статусы сохранены внутри карточек.</p>
          </div>
          <div className="pipeline-result-count">Показано {filteredDeals.length} из {allDeals.length}</div>
        </div>

        <div className="pipeline-filter-row">
          <label className="pipeline-search-field">
            <span>Поиск</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Клиент, сделка или номер"
            />
          </label>
          <label className="pipeline-filter-field">
            <span>Источник</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="all">Все источники</option>
              {sources.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="pipeline-filter-field">
            <span>Контроль</span>
            <select value={signal} onChange={(event) => setSignal(event.target.value)}>
              <option value="all">Все сделки</option>
              <option value="overdue">Есть просрочка</option>
              <option value="no_next">Нет следующего действия</option>
            </select>
          </label>
        </div>

        <div className="pipeline-summary-row">
          <div><span>Сделок</span><strong>{filteredDeals.length}</strong></div>
          <div><span>Сумма</span><strong>{formatCurrency(filteredValue)}</strong></div>
          <div className={overdueCount ? "pipeline-summary-alert" : ""}><span>Просрочено</span><strong>{overdueCount}</strong></div>
          <div className={missingNextCount ? "pipeline-summary-alert" : ""}><span>Без следующего шага</span><strong>{missingNextCount}</strong></div>
        </div>
        <p className="pipeline-live-message" aria-live="polite">{message}</p>
      </section>

      {selectedDeal ? (
        <section id="pipeline-stage-action" className="pipeline-action-panel" aria-label="Изменение этапа сделки">
          <div className="pipeline-action-copy">
            <span className="pipeline-action-kicker">Следующий шаг</span>
            <h3>{selectedDeal.title}</h3>
            <p>{selectedDeal.client?.name ?? selectedDeal.lead?.name ?? "Клиент не указан"}</p>
          </div>
          <label>
            <span>Новый статус</span>
            <select value={nextStatusCode} onChange={(event) => setNextStatusCode(event.target.value)}>
              {selectedDeal.allowed_next.map((statusCode) => (
                <option key={statusCode} value={statusCode}>
                  {getPipelineStatusLabel(statusCode)}
                </option>
              ))}
            </select>
          </label>
          {!isTerminalMove ? (
            <>
              <label>
                <span>Следующее действие</span>
                <select value={nextActionType} onChange={(event) => setNextActionType(event.target.value)}>
                  {FOLLOW_UP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Дедлайн</span>
                <input
                  type="datetime-local"
                  value={nextActionDueAt}
                  min={tomorrowInputValue().slice(0, 10) + "T00:00"}
                  onChange={(event) => setNextActionDueAt(event.target.value)}
                />
              </label>
              <label className="pipeline-action-notes">
                <span>Комментарий</span>
                <input
                  value={nextActionNotes}
                  onChange={(event) => setNextActionNotes(event.target.value)}
                  placeholder="Что нужно сделать"
                />
              </label>
            </>
          ) : (
            <p className="pipeline-terminal-note">Финальный статус: новое действие не требуется.</p>
          )}
          <div className="pipeline-action-buttons">
            <button type="button" className="soft-button" onClick={() => setActionDealId(null)} disabled={saving}>Отмена</button>
            <button type="button" className="accent-button" onClick={submitStageAction} disabled={saving}>
              {saving ? "Сохраняю…" : "Сохранить переход"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="pipeline-stage-grid" aria-label="Этапы воронки">
        {groupedStages.map((stage, index) => {
          const stageValue = stage.deals.reduce((sum, deal) => sum + deal.estimated_value, 0);
          const canDrop = draggedDealId
            ? Boolean(
                allDeals.find((deal) => deal.deal_id === draggedDealId && getAllowedTargetStatuses(deal.pipeline_status.status_code, stage.key).length),
              )
            : false;

          return (
            <div
              key={stage.key}
              className={`pipeline-stage-column${dropStageKey === stage.key && canDrop ? " pipeline-stage-column-drop" : ""}`}
              onDragOver={(event) => {
                if (canDrop) {
                  event.preventDefault();
                  setDropStageKey(stage.key);
                }
              }}
              onDragLeave={() => setDropStageKey((current) => current === stage.key ? null : current)}
              onDrop={() => handleDrop(stage.key)}
            >
              <header className="pipeline-stage-header">
                <div className="pipeline-stage-index">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{stage.label}</h3>
                  <p>{stage.description}</p>
                </div>
                <div className="pipeline-stage-totals">
                  <strong>{stage.deals.length}</strong>
                  <span>{formatCurrency(stageValue)}</span>
                </div>
              </header>

              <div className="pipeline-deal-list">
                {stage.deals.length ? stage.deals.map((deal) => {
                  const isOverdue = Boolean(deal.next_follow_up && new Date(deal.next_follow_up.due_at).getTime() < Date.now());
                  return (
                    <article
                      key={deal.deal_id}
                      className={`pipeline-deal-card${deal.status_flags.needs_attention || !deal.next_follow_up ? " pipeline-deal-card-alert" : ""}`}
                      draggable
                      onDragStart={(event) => {
                        setDraggedDealId(deal.deal_id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", deal.deal_id);
                      }}
                      onDragEnd={() => {
                        setDraggedDealId(null);
                        setDropStageKey(null);
                      }}
                    >
                      <div className="pipeline-deal-topline">
                        <span className="pipeline-detail-status">{getPipelineStatusLabel(deal.pipeline_status.status_code)}</span>
                        <strong>{formatCurrency(deal.estimated_value, deal.currency)}</strong>
                      </div>
                      <Link href={`/manager/crm/deals/${deal.deal_id}`} className="pipeline-deal-title">
                        {deal.title}
                      </Link>
                      <div className="pipeline-deal-client">
                        {deal.client?.name ?? deal.lead?.name ?? "Клиент не указан"}
                        {deal.deal_code ? <span className="mono">{deal.deal_code}</span> : null}
                      </div>
                      <div className="pipeline-deal-context">
                        <span>{deal.lead?.source ?? "Источник не указан"}</span>
                        <span>{deal.assigned_manager?.full_name ?? "Без менеджера"}</span>
                      </div>
                      <div className={`pipeline-next-action${!deal.next_follow_up || isOverdue ? " pipeline-next-action-alert" : ""}`}>
                        <span>Следующее действие</span>
                        <strong>
                          {deal.next_follow_up
                            ? `${formatFollowUpType(deal.next_follow_up.type_key)} · ${formatDateTime(deal.next_follow_up.due_at)}`
                            : "Не назначено"}
                        </strong>
                      </div>
                      <div className="pipeline-deal-footer">
                        <span>Задачи {deal.task_summary.open}/{deal.task_summary.total}</span>
                        {deal.allowed_next.length ? (
                          <button type="button" onClick={() => openStageAction(deal)}>Сменить этап</button>
                        ) : (
                          <span>Завершено</span>
                        )}
                      </div>
                    </article>
                  );
                }) : <div className="pipeline-stage-empty">Нет сделок</div>}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
