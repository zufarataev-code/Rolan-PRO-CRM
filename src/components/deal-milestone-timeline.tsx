"use client";

import { useEffect, useState } from "react";

type Milestone = {
  key: string;
  label: string;
  state: "done" | "planned" | "waiting" | "ready" | "locked";
  date: string | null;
};

type TimelinePayload = {
  milestones: Milestone[];
  project: {
    project_id: string;
    project_code: string | null;
    launched_at: string;
  } | null;
};

type Props = {
  dealId: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date);
}

function stateLabel(state: Milestone["state"]) {
  switch (state) {
    case "done":
      return "Готово";
    case "planned":
      return "Назначено";
    case "ready":
      return "Готово к запуску";
    case "waiting":
      return "Ожидает";
    default:
      return "После предыдущего этапа";
  }
}

export function DealMilestoneTimeline({ dealId }: Props) {
  const [data, setData] = useState<TimelinePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/v1/deals/${dealId}/timeline`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.data) {
          throw new Error(payload?.errors?.[0]?.message ?? "Не удалось загрузить даты сделки.");
        }
        if (!cancelled) setData(payload.data as TimelinePayload);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось загрузить даты сделки.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  if (error) {
    return (
      <section className="surface">
        <h3 className="surface-title">Воронка сделки по датам</h3>
        <p className="row-meta project-warning">{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="surface">
        <h3 className="surface-title">Воронка сделки по датам</h3>
        <p className="row-meta">Загружаю этапы…</p>
      </section>
    );
  }

  return (
    <section className="surface">
      <div className="detail-hero">
        <div>
          <h3 className="surface-title">Воронка сделки по датам</h3>
          <p className="surface-subtitle">До договора и аванса это продажа. Номер проекта появляется только после запуска.</p>
        </div>
        {data.project ? <div className="chip chip-success">{data.project.project_code ?? "PROJECT"}</div> : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
          gap: 10,
          marginTop: 16,
        }}
      >
        {data.milestones.map((milestone, index) => {
          const complete = milestone.state === "done";
          const active = milestone.state === "planned" || milestone.state === "ready" || milestone.state === "waiting";
          return (
            <div
              key={milestone.key}
              style={{
                border: complete ? "1px solid #bbf7d0" : active ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
                background: complete ? "#f0fdf4" : active ? "#eff6ff" : "#f8fafc",
                borderRadius: 14,
                padding: 12,
                minHeight: 102,
              }}
            >
              <div className="row-meta">{String(index + 1).padStart(2, "0")}</div>
              <div className="row-title" style={{ marginTop: 4 }}>{milestone.label}</div>
              <div style={{ fontWeight: 800, marginTop: 8 }}>{formatDate(milestone.date)}</div>
              <div className="row-meta" style={{ marginTop: 4 }}>{stateLabel(milestone.state)}</div>
            </div>
          );
        })}
      </div>

      {data.project ? (
        <div className="detail-meta" style={{ marginTop: 14 }}>
          <span>Проект запущен: {formatDate(data.project.launched_at)}</span>
          <span>Номер: {data.project.project_code ?? data.project.project_id}</span>
        </div>
      ) : (
        <div className="detail-meta" style={{ marginTop: 14 }}>
          <span>PRJ-номер ещё не присвоен</span>
          <span>Он появится после подписанного договора, аванса и действия «Запустить проект»</span>
        </div>
      )}
    </section>
  );
}
