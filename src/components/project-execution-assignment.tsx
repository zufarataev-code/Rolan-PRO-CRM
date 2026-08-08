"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
  const [startTime, setStartTime] = useState(() => formatTimeInput(initialSchedule?.start_time ?? null));
  const [endTime, setEndTime] = useState(() => formatTimeInput(initialSchedule?.end_time ?? null));
  const [crewId, setCrewId] = useState(initialSchedule?.crew_id ?? "");
  const [managerNotes, setManagerNotes] = useState(initialManagerNotes ?? "");
  const [positionAssignments, setPositionAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      positions.map((position) => [position.position_id, position.assigned_installer_id ?? ""]),
    ),
  );
  const [isFormOpen, setIsFormOpen] = useState(() => !initialSchedule);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Сначала назначьте дату, crew и installers по позициям проекта.");

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

  async function handleAssign() {
    if (!date || !crewId) {
      setMessage("Выберите дату монтажа и crew.");
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
    setMessage("Назначаю монтаж одним запросом...");

    try {
      await parseEnvelope(
        await fetch(`/api/v1/projects/${projectId}/assign-installation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date,
            start_time: startTime || null,
            end_time: endTime || null,
            crew_id: crewId,
            manager_notes: managerNotes.trim() || null,
            assignments: readyAssignments,
          }),
        }),
      );

      setMessage("Монтаж назначен. Schedule и installer jobs сохранены в одной операции.");
      setIsFormOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось назначить монтаж.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="assignment" className="surface">
      <div className="detail-hero">
        <div>
          <h3 className="surface-title">Монтаж</h3>
          <p className="surface-subtitle">
            Назначение монтажа выполняется только внутри проекта. Здесь manager задает дату, crew, installers и notes.
          </p>
        </div>

        <button
          type="button"
          className="accent-button"
          onClick={() => setIsFormOpen((current) => !current)}
        >
          {hasExistingAssignment ? (isFormOpen ? "Скрыть форму" : "Изменить назначение") : "Назначить монтаж"}
        </button>
      </div>

      <div className="inspector-list">
        <div className="inspector-item">
          <div className="row-title">Статус проекта</div>
          <div className="row-meta">{projectStatusLabel}</div>
        </div>
        <div className="inspector-item">
          <div className="row-title">Дата монтажа</div>
          <div className="row-meta">{date || "Не назначена"}</div>
        </div>
        <div className="inspector-item">
          <div className="row-title">Crew</div>
          <div className="row-meta">{selectedCrew?.name ?? "Не назначен"}</div>
        </div>
        <div className="inspector-item">
          <div className="row-title">Installers</div>
          <div className="row-meta">{assignedInstallerNames.length ? assignedInstallerNames.join(", ") : "Не назначены"}</div>
        </div>
      </div>

      {isFormOpen ? (
        <div className="split-grid">
          <div className="surface">
            <div className="proposal-item-grid">
              <label className="calculator-field">
                <span>Дата</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>

              <label className="calculator-field">
                <span>Start</span>
                <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </label>

              <label className="calculator-field">
                <span>End</span>
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
            <div className="surface-title">Project Positions</div>
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
        {isFormOpen ? (
          <button
            type="button"
            className="accent-button"
            onClick={handleAssign}
            disabled={saving || !date || !crewId || !hasCompleteAssignments}
          >
            {hasExistingAssignment ? "Сохранить назначение" : "Назначить монтаж"}
          </button>
        ) : null}
        <div className="row-meta">{message}</div>
      </div>
    </section>
  );
}
