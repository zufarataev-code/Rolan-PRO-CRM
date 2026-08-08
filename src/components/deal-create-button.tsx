"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DealCreateButtonProps = {
  title: string;
  leadId?: string | null;
  clientId?: string | null;
  notes?: string | null;
  label?: string;
  className?: string;
};

type ApiEnvelope = {
  data?: {
    deal_id?: string;
  };
  errors?: Array<{
    message?: string;
  }>;
};

export function DealCreateButton({
  title,
  leadId,
  clientId,
  notes,
  label = "Создать сделку",
  className = "soft-button",
}: DealCreateButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/v1/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          lead_id: leadId ?? null,
          client_id: clientId ?? null,
          notes: notes ?? null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as ApiEnvelope | null;

      if (!response.ok || !payload?.data?.deal_id) {
        throw new Error(payload?.errors?.[0]?.message ?? "Не удалось создать сделку.");
      }

      router.push(`/manager/crm/deals/${payload.data.deal_id}`);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось создать сделку.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button type="button" className={className} onClick={handleCreate} disabled={saving}>
      {saving ? "Создание..." : label}
    </button>
  );
}
