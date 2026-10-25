"use client";

import { FormEvent, useMemo, useState } from "react";

import type { PublicAppointment } from "@/features/legacy-crm/public-appointments";

type Props = {
  token: string;
  initialAppointment: PublicAppointment;
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

export function PublicAppointmentActions({ token, initialAppointment }: Props) {
  const [appointment, setAppointment] = useState(initialAppointment);
  const [action, setAction] = useState<"reschedule" | "cancel">("reschedule");
  const [requestedAt, setRequestedAt] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const minDate = useMemo(() => {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/public/appointments/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: action,
          requestedAt: action === "reschedule" ? new Date(requestedAt).toISOString() : null,
          reason,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.errors?.[0]?.message || "Не удалось отправить запрос.");
      setAppointment(result.data.appointment);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось отправить запрос.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "24px 16px", color: "#10233f" }}>
      <section style={{ width: "min(100%, 640px)", margin: "0 auto", background: "white", borderRadius: 24, boxShadow: "0 18px 60px rgba(15,35,63,.12)", overflow: "hidden" }}>
        <header style={{ padding: "28px 28px 22px", background: "linear-gradient(135deg,#102b4e,#124d76)", color: "white" }}>
          <div style={{ fontSize: 13, letterSpacing: ".12em", fontWeight: 800, opacity: .78 }}>ROLAN PRO · ВИЗИТ</div>
          <h1 style={{ margin: "10px 0 4px", fontSize: 30 }}>{appointment.eventTitle}</h1>
          <div style={{ opacity: .82 }}>Проект {appointment.orderNumber}</div>
        </header>

        <div style={{ padding: 28 }}>
          <p style={{ marginTop: 0, color: "#51657e" }}>Здравствуйте, {appointment.clientName}. Здесь можно проверить визит и отправить менеджеру запрос на перенос или отмену.</p>
          <div style={{ display: "grid", gap: 12, margin: "24px 0", padding: 20, border: "1px solid #dce6f1", borderRadius: 18, background: "#f8fbff" }}>
            <div><b>Дата и время</b><div style={{ marginTop: 5, fontSize: 18 }}>{displayDate(appointment.scheduledAt)}</div></div>
            <div><b>Адрес</b><div style={{ marginTop: 5 }}>{appointment.address || "Менеджер уточнит адрес"}</div></div>
          </div>

          {appointment.pendingRequest ? (
            <div role="status" style={{ padding: 20, borderRadius: 18, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46" }}>
              <b>Запрос уже отправлен</b>
              <p style={{ marginBottom: 0 }}>Менеджер получил запрос на {appointment.pendingRequest.type === "cancel" ? "отмену" : "перенос"} и свяжется с вами после проверки графика.</p>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontWeight: 800, marginBottom: 10 }}>Что нужно изменить?</legend>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {(["reschedule", "cancel"] as const).map((value) => (
                    <button key={value} type="button" onClick={() => setAction(value)} style={{ minHeight: 48, borderRadius: 12, border: `1px solid ${action === value ? "#0b74de" : "#cbd8e6"}`, color: action === value ? "#0759aa" : "#334a64", background: action === value ? "#eaf4ff" : "white", fontWeight: 800 }}>
                      {value === "reschedule" ? "Перенести" : "Отменить"}
                    </button>
                  ))}
                </div>
              </fieldset>

              {action === "reschedule" ? (
                <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>
                  Удобные дата и время
                  <input required type="datetime-local" min={minDate} value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} style={{ minHeight: 48, border: "1px solid #cbd8e6", borderRadius: 12, padding: "0 12px", fontSize: 16 }} />
                </label>
              ) : null}

              <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>
                Причина или комментарий
                <textarea required minLength={3} maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} style={{ border: "1px solid #cbd8e6", borderRadius: 12, padding: 12, fontSize: 16, resize: "vertical" }} />
              </label>

              {error ? <div role="alert" style={{ padding: 12, borderRadius: 12, background: "#fff1f2", color: "#be123c" }}>{error}</div> : null}
              <button disabled={submitting} type="submit" style={{ minHeight: 52, border: 0, borderRadius: 14, background: "#0b74de", color: "white", fontSize: 16, fontWeight: 900, opacity: submitting ? .65 : 1 }}>
                {submitting ? "Отправляем…" : "Отправить запрос менеджеру"}
              </button>
              <small style={{ color: "#667b94", lineHeight: 1.5 }}>Визит не изменится автоматически. Менеджер сначала проверит график и подтвердит новое время или отмену.</small>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
