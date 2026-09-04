"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProjectExecutionAssignmentProps = {
  projectId: string;
  projectStatusLabel: string;
  initialSchedule: {
    date: Date | string | null;
    start_time: Date | string | null;
    end_time: Date | string | null;
    crew_id: string | null;
  } | null;
  initialManagerNotes?: string | null;
  crews: Array<{
    crew_id: string;
    name: string;
  }>;
  installers: Array<{
    user_id: string;
    full_name: string;
    email: string;
  }>;
  positions: Array<{
    position_id: string;
    title: string;
    assigned_installer_id: string | null;
  }>;
};

type LifecycleSummary = {
  project_id: string;
  project_status: {
    status_code: string;
    name_ru: string;
  };
  is_completed: boolean;
  schedule: {
    date: string;
    end_date: string;
    start_time: string | null;
    end_time: string | null;
    crew: {
      crew_id: string;
      name: string;
    };
  } | null;
  execution: {
    jobs_total: number;
    jobs_active: number;
    jobs_completed: number;
    installers: Array<{
      user_id: string;
      full_name: string;
    }>;
  };
  calculator: {
    positions_count: number;
    total_billable_sqft: number;
    total_actual_film_sqft: number;
    client_total: number;
    addons_total: number;
    lines: Array<{
      position_id: string;
      title: string;
      service_name: string;
      film_name: string | null;
      sqft: number;
      actual_film_sqft: number;
      client_amount: number;
    }>;
    internal_finance: {
      material_cost: number;
      installation_cost: number;
      estimated_cost: number;
      estimated_profit: number;
      estimated_margin_percent: number;
    } | null;
  };
};

function toDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateInput(value: Date | string | null) {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function formatTimeInput(value: Date | string | null) {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  return date.toISOString().slice(11, 16);
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

async function parseEnvelope(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: Record<string, unknown>;
        errors?: Array<{ message?: string }>;
      }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message ?? "Request failed.");
  }

  return payload.data;
}

export function ProjectExecutionAssignment({
  projectId,
  projectStatusLabel,
  initialSchedule,
  initialManagerNotes,
  crews,
  installers,
  positions,
}: ProjectExecutionAssignmentProps) {
  const router = useRouter();
  const [date, setDate] = useState(() => formatDateInput(initialSchedule?.date ?? null));
  const [endDate, setEndDate] = useState(() => formatDateInput(initialSchedule?.date ?? null));
  const [startTime, setStartTime] = useState(() => formatTimeInput(initialSchedule?.start_time ?? null));
  const [endTime, setEndTime] = useState(() => formatTimeInput(initialSchedule?.end_time ?? null));
  const [crewId, setCrewId] = useState(initialSchedule?.crew_id ?? "");
  const [managerNotes, setManagerNotes] = useState(initialManagerNotes ?? "");
  const [positionAssignments, setPositionAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      positions.map((position) => [position.position_id, position.assigned_installer_id ?? ""]),
    ),
  );
  const [lifecycle, setLifecycle] = useState<LifecycleSummary | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(() => !initialSchedule);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [message, setMessage] = useState("Сначала проверьте состав проекта, затем назначьте даты, crew и installers.");

  const loadLifecycle = useCallback(async () => {
    const response = await fetch(`/api/v1/projects/${projectId}/lifecycle`, {
      cache: "no-store",
    });
    const data = await parseEnvelope(response);
    const nextLifecycle = data.lifecycle as LifecycleSummary | undefined;

    if (nextLifecycle) {
      setLifecycle(nextLifecycle);
      if (nextLifecycle.schedule?.end_date) {
        setEndDate(nextLifecycle.schedule.end_date);
      }
    }
  }, [projectId]);

  useEffect(() => {
    void loadLifecycle().catch(() => {
      setMessage("Не удалось загрузить lifecycle проекта. Обновите страницу.");
    });
  }, [loadLifecycle]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.location.hash === "#assignment") {
      setIsFormOpen(true);
    }
  }, []);

  const hasExistingAssignment =
    Boolean(initialSchedule?.date) ||
    Boolean(initialSchedule?.crew_id) ||
    positions.some((position) => Boolean(position.assigned_installer_id));

  const readyAssignments = useMemo(
    () =>
      positions
        .map((position) => ({
          project_position_id: position.position_id,
          installer_id: positionAssignments[position.position_id] ?? "",
        }))
        .filter((assignment) => assignment.installer_id),
    [positionAssignments, positions],
  );

  const hasCompleteAssignments = positions.length > 0 && readyAssignments.length === positions.length;
  const selectedCrew = crews.find((crew) => crew.crew_id === crewId) ?? null;
  const assignedInstallerNames = positions
    .map(
      (position) =>
        installers.find((installer) => installer.user_id === (positionAssignments[position.position_id] ?? ""))?.full_name,
    )
    .filter((value): value is string => Boolean(value));
  const isCompleted = lifecycle?.is_completed ?? projectStatusLabel.toLowerCase().includes("заверш");
  const statusLabel = lifecycle?.project_status.name_ru ?? projectStatusLabel;
  const positionsReady = (lifecycle?.calculator.positions_count ?? positions.length) > 0;
  const scheduleReady = Boolean(lifecycle?.schedule ?? initialSchedule);
  const installersReady = lifecycle
    ? lifecycle.execution.jobs_total > 0 && lifecycle.execution.jobs_total >= lifecycle.calculator.positions_count
    : hasCompleteAssignments;

  async function handleAssign() {
    if (!date || !crewId) {
      setMessage("Выберите дату начала монтажа и crew.");
      return;
    }

    if (endDate && endDate < date) {
      setMessage("Дата окончания монтажа не может быть раньше даты начала.");
      return;
    }

    if (positions.length === 0) {
      setMessage("В проекте нет позиций для назначения монтажа.");
      return;
    }

    if (!hasCompleteAssignments) {
      setMessage("Назначьте installer для каждой project position.");
      return;
    }

    setSaving(true);
    setMessage("Сохраняю даты, crew и исполнителей...");

    try {
      await parseEnvelope(
        await fetch(`/api/v1/projects/${projectId}/assign-installation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date,
            end_date: endDate || date,
            start_time: startTime || null,
            end_time: endTime || null,
            crew_id: crewId,
            manager_notes: managerNotes.trim() || null,
            assignments: readyAssignments,
          }),
        }),
      );

      await loadLifecycle();
      setMessage("Монтаж назначен: даты, crew и installer jobs сохранены на сервере.");
      setIsFormOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось назначить монтаж.");
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Подтвердить завершение монтажа? Проект и все незакрытые монтажные позиции будут переведены в завершённые.",
      );
      if (!confirmed) return;
    }

    setCompleting(true);
    setMessage("Закрываю монтаж и проект...");

    try {
      await parseEnvelope(
        await fetch(`/api/v1/projects/${projectId}/complete-installation`, {
          method: "POST",
        }),
      );
      await loadLifecycle();
      setIsFormOpen(false);
      setMessage("Монтаж завершён. Проект перенесён в завершённые и записан в историю.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось завершить монтаж.");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <section id="assignment" className="surface">
      <div className="detail-hero">
        <div>
          <h3 className="surface-title">Полный цикл проекта и монтаж</h3>
          <p className="surface-subtitle">
            Состав проекта → расчёт → исполнитель → даты монтажа → выполнение → завершение.
          </p>
        </div>

        <div className="surface-actions">
          {isCompleted ? (
            <span className="chip chip-accent">✓ Монтаж завершён</span>
          ) : (
            <>
              <button
                type="button"
                className="soft-button"
                onClick={() => setIsFormOpen((current) => !current)}
              >
                {hasExistingAssignment ? (isFormOpen ? "Скрыть назначение" : "Изменить монтаж") : "Назначить монтаж"}
              </button>
              <button
                type="button"
                className="accent-button"
                onClick={handleComplete}
                disabled={completing}
              >
                {completing ? "Завершаю…" : "✓ Монтаж завершён"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="project-inline-chips" style={{ marginBottom: 18 }}>
        <span className={`chip${positionsReady ? " chip-accent" : ""}`}>1. Состав проекта</span>
        <span className={`chip${lifecycle ? " chip-accent" : ""}`}>2. Расчёт</span>
        <span className={`chip${installersReady ? " chip-accent" : ""}`}>3. Исполнитель</span>
        <span className={`chip${scheduleReady ? " chip-accent" : ""}`}>4. Даты</span>
        <span className={`chip${isCompleted ? " chip-accent" : ""}`}>5. Завершено</span>
      </div>

      {lifecycle ? (
        <section className="project-subpanel" style={{ marginBottom: 18 }}>
          <div className="project-subpanel-title">Калькулятор проекта</div>
          <div className="project-finance-grid">
            <div className="calculator-metric-card">
              <span>Площадь клиенту</span>
              <strong>{lifecycle.calculator.total_billable_sqft.toFixed(1)} sqft</strong>
            </div>
            <div className="calculator-metric-card">
              <span>Фактическая плёнка</span>
              <strong>{lifecycle.calculator.total_actual_film_sqft.toFixed(1)} sqft</strong>
            </div>
            <div className="calculator-metric-card">
              <span>Сумма проекта</span>
              <strong>{formatMoney(lifecycle.calculator.client_total)}</strong>
            </div>
            <div className="calculator-metric-card">
              <span>Доп. услуги</span>
              <strong>{formatMoney(lifecycle.calculator.addons_total)}</strong>
            </div>
          </div>

          {lifecycle.calculator.internal_finance ? (
            <div className="project-finance-grid" style={{ marginTop: 12 }}>
              <div className="calculator-metric-card">
                <span>Материал</span>
                <strong>{formatMoney(lifecycle.calculator.internal_finance.material_cost)}</strong>
              </div>
              <div className="calculator-metric-card">
                <span>Монтаж</span>
                <strong>{formatMoney(lifecycle.calculator.internal_finance.installation_cost)}</strong>
              </div>
              <div className="calculator-metric-card">
                <span>Прибыль</span>
                <strong>{formatMoney(lifecycle.calculator.internal_finance.estimated_profit)}</strong>
              </div>
              <div className="calculator-metric-card">
                <span>Маржа</span>
                <strong>{lifecycle.calculator.internal_finance.estimated_margin_percent.toFixed(1)}%</strong>
              </div>
            </div>
          ) : null}

          <div className="list-stack" style={{ marginTop: 14 }}>
            {lifecycle.calculator.lines.map((line) => (
              <div key={line.position_id} className="list-row">
                <div>
                  <div className="row-title">{line.title}</div>
                  <div className="row-meta">
                    {line.service_name}{line.film_name ? ` • ${line.film_name}` : ""} • {line.sqft.toFixed(1)} sqft
                  </div>
                </div>
                <strong>{formatMoney(line.client_amount)}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="inspector-list">
        <div className="inspector-item">
          <div className="row-title">Статус проекта</div>
          <div className="row-meta">{statusLabel}</div>
        </div>
        <div className="inspector-item">
          <div className="row-title">Монтаж</div>
          <div className="row-meta">
            {date || "Дата не назначена"}{date ? ` — ${endDate || date}` : ""}
            {startTime ? ` • ${startTime}` : ""}{endTime ? `–${endTime}` : ""}
          </div>
        </div>
        <div className="inspector-item">
          <div className="row-title">Crew</div>
          <div className="row-meta">{selectedCrew?.name ?? lifecycle?.schedule?.crew.name ?? "Не назначен"}</div>
        </div>
        <div className="inspector-item">
          <div className="row-title">Installers</div>
          <div className="row-meta">
            {assignedInstallerNames.length
              ? assignedInstallerNames.join(", ")
              : lifecycle?.execution.installers.map((installer) => installer.full_name).join(", ") || "Не назначены"}
          </div>
        </div>
      </div>

      {!isCompleted && isFormOpen ? (
        <div className="split-grid">
          <div className="surface">
            <div className="proposal-item-grid">
              <label className="calculator-field">
                <span>Начало монтажа</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setDate(nextDate);
                    if (!endDate || endDate < nextDate) setEndDate(nextDate);
                  }}
                />
              </label>

              <label className="calculator-field">
                <span>Окончание монтажа</span>
                <input
                  type="date"
                  min={date || undefined}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>

              <label className="calculator-field">
                <span>Начало дня</span>
                <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </label>

              <label className="calculator-field">
                <span>Конец дня</span>
                <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </label>

              <label className="calculator-field">
                <span>Crew</span>
                <select value={crewId} onChange={(event) => setCrewId(event.target.value)}>
                  <option value="">Выберите crew</option>
                  {crews.map((crew) => (
                    <option key={crew.crew_id} value={crew.crew_id}>
                      {crew.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="calculator-notes">
              <span>Manager notes</span>
              <textarea
                rows={3}
                value={managerNotes}
                onChange={(event) => setManagerNotes(event.target.value)}
                placeholder="Что важно для монтажа: доступ, клиент, подготовка, электрика, ограничения по времени."
              />
            </label>
          </div>

          <div className="surface">
            <div className="surface-title">Исполнители по позициям</div>
            <p className="surface-subtitle">Для каждой комнаты / позиции проекта выберите ответственного монтажника.</p>
            <div className="list-stack">
              {positions.map((position) => (
                <div key={position.position_id} className="list-row">
                  <div>
                    <div className="row-title">{position.title}</div>
                    <div className="row-meta mono">{position.position_id}</div>
                  </div>

                  <label className="calculator-field" style={{ minWidth: 280 }}>
                    <span>Installer</span>
                    <select
                      value={positionAssignments[position.position_id] ?? ""}
                      onChange={(event) =>
                        setPositionAssignments((current) => ({
                          ...current,
                          [position.position_id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Назначить installer</option>
                      {installers.map((installer) => (
                        <option key={installer.user_id} value={installer.user_id}>
                          {installer.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="proposal-builder-footer">
        {!isCompleted && isFormOpen ? (
          <button
            type="button"
            className="accent-button"
            onClick={handleAssign}
            disabled={saving || !date || !crewId || !hasCompleteAssignments}
          >
            {saving ? "Сохраняю…" : hasExistingAssignment ? "Сохранить монтаж" : "Назначить монтаж"}
          </button>
        ) : null}
        <div className="row-meta">{message}</div>
      </div>
    </section>
  );
}
