"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Installer = {
  user_id: string;
  full_name: string;
  email: string;
};

type Crew = {
  crew_id: string;
  name: string;
};

type Position = {
  position_id: string;
  title: string;
};

type PhaseJob = {
  installer_job_id: string;
  status: string;
  installer: Installer;
  position: {
    position_id: string;
    title: string | null;
    service_type?: { name_ru?: string; name_en?: string } | null;
    film?: { brand_name_ru?: string; model_name_ru?: string } | null;
  } | null;
};

type Phase = {
  calendar_event_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  metadata?: {
    client_confirmed?: boolean;
    client_confirmation_note?: string | null;
    phase_number?: number;
  } | null;
  installer_jobs: PhaseJob[];
};

type Props = {
  projectId: string;
  projectStatusLabel: string;
  crews: Crew[];
  installers: Installer[];
  positions: Position[];
};

type ApiEnvelope = {
  data?: any;
  errors?: Array<{ message?: string }>;
};

async function parseEnvelope(response: Response) {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope | null;
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message ?? "Request failed.");
  }
  return payload.data;
}

function localInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function initialStart() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return localInputValue(date);
}

function initialEnd() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(17, 0, 0, 0);
  return localInputValue(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ProjectPhasesManager({ projectId, projectStatusLabel, crews, installers, positions }: Props) {
  const router = useRouter();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Добавьте один или несколько этапов монтажа с отдельными датами и исполнителями.");
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("Этап монтажа 1");
  const [startsAt, setStartsAt] = useState(initialStart);
  const [endsAt, setEndsAt] = useState(initialEnd);
  const [crewId, setCrewId] = useState("");
  const [clientConfirmed, setClientConfirmed] = useState(false);
  const [clientConfirmationNote, setClientConfirmationNote] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<Record<string, boolean>>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  async function loadPhases() {
    setLoading(true);
    try {
      const data = await parseEnvelope(
        await fetch(`/api/v1/projects/${projectId}/phases`, { cache: "no-store" }),
      );
      const items = Array.isArray(data.items) ? (data.items as Phase[]) : [];
      setPhases(items);
      setTitle(`Этап монтажа ${items.length + 1}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить этапы монтажа.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPhases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const alreadyScheduledPositionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const phase of phases) {
      for (const job of phase.installer_jobs ?? []) {
        if (job.position?.position_id) ids.add(job.position.position_id);
      }
    }
    return ids;
  }, [phases]);

  const availablePositions = useMemo(
    () => positions.filter((position) => !alreadyScheduledPositionIds.has(position.position_id)),
    [positions, alreadyScheduledPositionIds],
  );

  const chosenPositions = availablePositions.filter((position) => selectedPositions[position.position_id]);
  const allChosenHaveInstaller =
    chosenPositions.length > 0 && chosenPositions.every((position) => Boolean(assignments[position.position_id]));

  function togglePosition(positionId: string, checked: boolean) {
    setSelectedPositions((current) => ({ ...current, [positionId]: checked }));
    if (!checked) {
      setAssignments((current) => ({ ...current, [positionId]: "" }));
    }
  }

  async function createPhase() {
    if (!title.trim() || !startsAt || !endsAt) {
      setMessage("Укажите название, начало и окончание этапа.");
      return;
    }
    if (!allChosenHaveInstaller) {
      setMessage("Выберите услуги этапа и назначьте монтажника для каждой выбранной позиции.");
      return;
    }

    setSaving(true);
    setMessage("Сохраняю этап монтажа…");
    try {
      await parseEnvelope(
        await fetch(`/api/v1/projects/${projectId}/phases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            starts_at: new Date(startsAt).toISOString(),
            ends_at: new Date(endsAt).toISOString(),
            client_confirmed: clientConfirmed,
            client_confirmation_note: clientConfirmationNote.trim() || null,
            crew_id: crewId || null,
            position_ids: chosenPositions.map((position) => position.position_id),
            assignments: chosenPositions.map((position) => ({
              project_position_id: position.position_id,
              installer_id: assignments[position.position_id],
            })),
            notes: notes.trim() || null,
          }),
        }),
      );

      setMessage("Этап сохранён. Дата, услуги и исполнители привязаны к проекту.");
      setSelectedPositions({});
      setAssignments({});
      setCrewId("");
      setClientConfirmed(false);
      setClientConfirmationNote("");
      setNotes("");
      setFormOpen(false);
      await loadPhases();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать этап монтажа.");
    } finally {
      setSaving(false);
    }
  }

  async function completePhase(phase: Phase) {
    if (!window.confirm(`Завершить «${phase.title}»? Если это последний этап, весь проект будет закрыт.`)) {
      return;
    }

    setSaving(true);
    setMessage(`Завершаю ${phase.title}…`);
    try {
      const data = await parseEnvelope(
        await fetch(`/api/v1/projects/${projectId}/phases/${phase.calendar_event_id}/complete`, {
          method: "POST",
        }),
      );
      setMessage(
        data.project_completed
          ? "Последний этап завершён — проект переведён в завершённые."
          : "Этап завершён. Остальные этапы проекта остаются в работе.",
      );
      await loadPhases();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось завершить этап.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="assignment" className="surface">
      <div className="detail-hero">
        <div>
          <h3 className="surface-title">Этапы монтажа</h3>
          <p className="surface-subtitle">
            Один проект может иметь несколько выездов: разные услуги, даты, время и исполнители. Последний завершённый этап закрывает проект.
          </p>
        </div>
        <button
          type="button"
          className="accent-button"
          onClick={() => setFormOpen((current) => !current)}
          disabled={saving || availablePositions.length === 0}
        >
          {formOpen ? "Скрыть форму" : "+ Добавить этап"}
        </button>
      </div>

      <div className="detail-meta" style={{ marginTop: 12 }}>
        <span>Статус проекта: {projectStatusLabel}</span>
        <span>Этапов: {phases.length}</span>
        <span>Осталось распределить услуг: {availablePositions.length}</span>
      </div>

      {loading ? <div className="empty-state" style={{ marginTop: 16 }}>Загружаю этапы…</div> : null}

      {!loading && phases.length ? (
        <div className="project-position-stack" style={{ marginTop: 16 }}>
          {phases.map((phase, index) => {
            const completed = phase.status === "completed";
            const installerNames = [...new Set((phase.installer_jobs ?? []).map((job) => job.installer?.full_name).filter(Boolean))];
            return (
              <article key={phase.calendar_event_id} className="project-position-card">
                <div className="project-position-header">
                  <div>
                    <div className="page-kicker mono">ЭТАП {phase.metadata?.phase_number ?? index + 1}</div>
                    <div className="row-title">{phase.title}</div>
                    <div className="row-meta">
                      {formatDateTime(phase.starts_at)} → {formatDateTime(phase.ends_at)}
                    </div>
                  </div>
                  <div className="project-inline-chips">
                    <span className={`chip${completed ? " chip-success" : " chip-accent"}`}>
                      {completed ? "Завершён" : "Запланирован"}
                    </span>
                    <span className="chip">
                      {phase.metadata?.client_confirmed ? "Клиент подтвердил" : "Ждём подтверждение клиента"}
                    </span>
                  </div>
                </div>

                <div className="inspector-list" style={{ marginTop: 12 }}>
                  <div className="inspector-item">
                    <div className="row-title">Исполнители</div>
                    <div className="row-meta">{installerNames.length ? installerNames.join(", ") : "Не назначены"}</div>
                  </div>
                  {(phase.installer_jobs ?? []).map((job) => (
                    <div key={job.installer_job_id} className="inspector-item">
                      <div className="row-title">{job.position?.title ?? "Услуга проекта"}</div>
                      <div className="row-meta">
                        {job.position?.service_type?.name_ru ?? "Услуга"} · {job.installer.full_name} · {job.status}
                      </div>
                    </div>
                  ))}
                  {phase.metadata?.client_confirmation_note ? (
                    <div className="inspector-item">
                      <div className="row-title">Согласование с клиентом</div>
                      <div className="row-meta">{phase.metadata.client_confirmation_note}</div>
                    </div>
                  ) : null}
                </div>

                {!completed ? (
                  <button
                    type="button"
                    className="accent-button"
                    style={{ marginTop: 14 }}
                    onClick={() => completePhase(phase)}
                    disabled={saving}
                  >
                    Монтаж этапа завершён
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {!loading && !phases.length ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          Этапы ещё не созданы. Нажмите «+ Добавить этап», выберите услуги, дату и исполнителей.
        </div>
      ) : null}

      {formOpen ? (
        <div className="split-grid" style={{ marginTop: 18 }}>
          <div className="surface">
            <h4 className="surface-title">Новый этап</h4>
            <div className="proposal-item-grid">
              <label className="calculator-field">
                <span>Название</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например: Smart Film — 1 этаж" />
              </label>
              <label className="calculator-field">
                <span>Начало</span>
                <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
              </label>
              <label className="calculator-field">
                <span>Окончание</span>
                <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
              </label>
              <label className="calculator-field">
                <span>Бригада (опционально)</span>
                <select value={crewId} onChange={(event) => setCrewId(event.target.value)}>
                  <option value="">Без общей бригады</option>
                  {crews.map((crew) => (
                    <option key={crew.crew_id} value={crew.crew_id}>{crew.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="calculator-field" style={{ marginTop: 12 }}>
              <span>
                <input
                  type="checkbox"
                  checked={clientConfirmed}
                  onChange={(event) => setClientConfirmed(event.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Дата согласована с клиентом
              </span>
            </label>

            <label className="calculator-notes">
              <span>Комментарий по согласованию</span>
              <textarea
                rows={2}
                value={clientConfirmationNote}
                onChange={(event) => setClientConfirmationNote(event.target.value)}
                placeholder="Например: подтверждено с John по телефону 4 Sep"
              />
            </label>

            <label className="calculator-notes">
              <span>Примечание этапа</span>
              <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>

          <div className="surface">
            <h4 className="surface-title">Услуги и исполнители этого этапа</h4>
            <p className="surface-subtitle">Выберите только те позиции, которые выполняются в эту дату.</p>
            <div className="list-stack" style={{ marginTop: 12 }}>
              {availablePositions.map((position) => {
                const chosen = Boolean(selectedPositions[position.position_id]);
                return (
                  <div key={position.position_id} className="list-row" style={{ alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={chosen}
                        onChange={(event) => togglePosition(position.position_id, event.target.checked)}
                      />
                      <span className="row-title">{position.title}</span>
                    </label>
                    <select
                      value={assignments[position.position_id] ?? ""}
                      onChange={(event) => setAssignments((current) => ({ ...current, [position.position_id]: event.target.value }))}
                      disabled={!chosen}
                    >
                      <option value="">Выберите монтажника</option>
                      {installers.map((installer) => (
                        <option key={installer.user_id} value={installer.user_id}>{installer.full_name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {!availablePositions.length ? (
              <div className="empty-state">Все позиции проекта уже распределены по этапам.</div>
            ) : null}

            <button
              type="button"
              className="accent-button"
              style={{ marginTop: 16 }}
              onClick={createPhase}
              disabled={saving || !allChosenHaveInstaller}
            >
              {saving ? "Сохраняю…" : "Сохранить этап монтажа"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="row-meta" style={{ marginTop: 14 }}>{message}</div>
    </section>
  );
}
