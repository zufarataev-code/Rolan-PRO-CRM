"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type InstallerJobStatusActionsProps = {
  installerJobId: string;
  currentStatus: string;
};

const ACTIONS_BY_STATUS: Record<string, Array<{ status: string; label: string }>> = {
  assigned: [{ status: "on_the_way", label: "On the way" }],
  on_the_way: [{ status: "started", label: "Start" }],
  started: [
    { status: "paused", label: "Pause" },
    { status: "completed", label: "Complete" },
  ],
  paused: [{ status: "started", label: "Resume" }],
  completed: [],
};

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

export function InstallerJobStatusActions({
  installerJobId,
  currentStatus,
}: InstallerJobStatusActionsProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Обновляй статус по мере движения по объекту.");
  const actions = ACTIONS_BY_STATUS[currentStatus] ?? [];

  async function updateStatus(status: string) {
    setSaving(true);
    setMessage(`Обновляю статус: ${status}...`);

    try {
      await parseEnvelope(
        await fetch(`/api/v1/installer-jobs/${installerJobId}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        }),
      );

      setMessage(`Статус обновлен: ${status}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить статус.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface">
      <h3 className="surface-title">Job Actions</h3>
      <div className="proposal-builder-actions">
        {actions.map((action) => (
          <button
            key={action.status}
            type="button"
            className={action.status === "completed" ? "accent-button" : "soft-button"}
            onClick={() => updateStatus(action.status)}
            disabled={saving || currentStatus === action.status}
          >
            {action.label}
          </button>
        ))}
        {actions.length === 0 ? <div className="row-meta">Для текущего статуса доступных действий нет.</div> : null}
      </div>
      <div className="row-meta" style={{ marginTop: 12 }}>
        {message}
      </div>
    </section>
  );
}
