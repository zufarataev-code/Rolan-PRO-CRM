"use client";

import { useEffect, useState } from "react";

type Visit = {
  type: "consultation" | "measure" | "install";
  at: string;
  address: string;
  pending: { type: "reschedule" | "cancel"; requested_at: string | null; created_at: string } | null;
};

const TITLES = {
  consultation: { ru: "Консультация", en: "Consultation" },
  measure: { ru: "Замер", en: "Measurement" },
  install: { ru: "Монтаж", en: "Installation" },
};

function localInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Owner, 2026-11-01: the client sees the next visit on the proposal page and
// asks to move or cancel it here; the manager confirms in the CRM.
export function PublicVisitCard({ accessToken, language }: { accessToken: string; language: "ru" | "en" }) {
  const ru = language === "ru";
  const [visit, setVisit] = useState<Visit | null>(null);
  const [mode, setMode] = useState<"" | "reschedule" | "cancel">("");
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/proposals/${encodeURIComponent(accessToken)}/visit`)
      .then(response => (response.ok ? response.json() : null))
      .then(payload => { if (alive) setVisit(payload?.data?.visit || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [accessToken]);

  if (!visit) return null;
  const title = TITLES[visit.type][language];
  const at = new Date(visit.at).toLocaleString(ru ? "ru-RU" : "en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

  async function send() {
    if (!mode) return;
    setError("");
    if (reason.trim().length < 2) return setError(ru ? "Напишите коротко причину." : "Please write a short reason.");
    if (mode === "reschedule" && !when) return setError(ru ? "Выберите новое удобное время." : "Choose a new time that suits you.");
    setBusy(true);
    try {
      const response = await fetch(`/api/public/proposals/${encodeURIComponent(accessToken)}/visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, reason, requested_at: mode === "reschedule" ? new Date(when).toISOString() : null }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.errors?.[0]?.message || (ru ? "Не получилось отправить. Позвоните нам." : "Could not send. Please call us."));
      } else {
        setVisit(payload?.data?.visit || visit);
        setMode("");
      }
    } finally {
      setBusy(false);
    }
  }

  const button = { borderRadius: 10, padding: "10px 16px", fontWeight: 700, border: "1px solid #cbd5e1", background: "white", color: "#0f172a" } as const;
  return (
    <section id="proposal-visit" className="proposal-section">
      <div className="proposal-section-kicker">{ru ? "Ваш визит" : "Your visit"}</div>
      <h2 style={{ margin: "6px 0 4px" }}>{title}</h2>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{at}</div>
      {visit.address ? <div style={{ opacity: 0.75, marginTop: 4 }}>{visit.address}</div> : null}
      {visit.pending ? (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#fffbeb", color: "#92400e" }}>
          {visit.pending.type === "cancel"
            ? (ru ? "Вы попросили отменить визит. Менеджер свяжется с вами." : "You asked to cancel this visit. Our manager will contact you.")
            : (ru ? "Вы попросили перенести визит. Менеджер подтвердит новое время." : "You asked to reschedule. Our manager will confirm the new time.")}
        </div>
      ) : !mode ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button type="button" style={button} onClick={() => { setMode("reschedule"); setWhen(localInputValue(visit.at)); }}>{ru ? "Перенести" : "Reschedule"}</button>
          <button type="button" style={{ ...button, color: "#b91c1c" }} onClick={() => setMode("cancel")}>{ru ? "Отменить" : "Cancel"}</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {mode === "reschedule" ? (
            <label style={{ display: "grid", gap: 4 }}>{ru ? "Новое удобное время" : "New time that suits you"}
              <input type="datetime-local" value={when} onChange={event => setWhen(event.target.value)} style={{ minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid #cbd5e1" }} />
            </label>
          ) : null}
          <label style={{ display: "grid", gap: 4 }}>{ru ? "Причина" : "Reason"}
            <input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} placeholder={ru ? "Например: не будем дома" : "For example: we won't be home"} style={{ minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid #cbd5e1" }} />
          </label>
          {error ? <div style={{ color: "#b91c1c" }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={busy} onClick={send} style={{ ...button, background: "#1d4ed8", color: "white", border: "1px solid #1d4ed8" }}>
              {mode === "cancel" ? (ru ? "Попросить отмену" : "Request cancellation") : (ru ? "Попросить перенос" : "Request new time")}
            </button>
            <button type="button" style={button} onClick={() => { setMode(""); setError(""); }}>{ru ? "Назад" : "Back"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
