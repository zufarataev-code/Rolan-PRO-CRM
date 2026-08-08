"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type GmailStatus = {
  connected: boolean;
  email_address: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
};

type GmailAttachment = {
  name?: string;
  mime_type?: string;
  attachment_id?: string | null;
};

type GmailMessage = {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  sender_email: string | null;
  sender_name: string | null;
  recipient_emails: string[];
  subject: string;
  snippet: string;
  body: string;
  is_unread: boolean;
  sent_at: string;
  legacy_order_id: string | null;
  attachments: GmailAttachment[] | null;
};

type ComposeState = {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  orderId?: string | null;
};

const panelStyle = {
  border: "1px solid #dbe4f0",
  borderRadius: 18,
  background: "#fff",
  boxShadow: "0 12px 35px rgba(15, 23, 42, 0.06)",
} as const;

async function gmailApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/integrations/gmail${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => null) as null | {
    data?: T;
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok) throw new Error(payload?.errors?.[0]?.message || `Gmail API ${response.status}`);
  return payload?.data as T;
}

function displayContact(message: GmailMessage) {
  if (message.direction === "inbound") return message.sender_name || message.sender_email || "Клиент";
  return message.recipient_emails.join(", ") || "Получатель";
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function GmailMailbox({ canConnect }: { canConnect: boolean }) {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [sending, setSending] = useState(false);

  const loadMailbox = useCallback(async (sync = false) => {
    setLoading(true);
    setError("");
    try {
      let nextStatus = await gmailApi<GmailStatus>("/status");
      if (nextStatus.connected && sync) {
        await gmailApi("/sync", { method: "POST", body: "{}" });
        nextStatus = await gmailApi<GmailStatus>("/status");
      }
      setStatus(nextStatus);
      if (nextStatus.connected) {
        const result = await gmailApi<{ messages: GmailMessage[] }>("/messages");
        setMessages(result.messages || []);
        setSelectedId((current) => current || result.messages?.[0]?.id || null);
      } else {
        setMessages([]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить почту.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMailbox(false); }, [loadMailbox]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("compose") !== "1") return;
    setCompose({
      to: params.get("to") || "",
      subject: params.get("subject") || "",
      body: params.get("body") || "",
      orderId: params.get("orderId") || null,
    });
    window.history.replaceState(null, "", "/mail");
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return messages;
    return messages.filter((message) => [
      message.subject,
      message.sender_email,
      message.sender_name,
      message.body,
      ...message.recipient_emails,
    ].join(" ").toLowerCase().includes(normalized));
  }, [messages, query]);

  const selected = filtered.find((message) => message.id === selectedId) || filtered[0] || null;

  async function selectMessage(message: GmailMessage) {
    setSelectedId(message.id);
    if (!message.is_unread) return;
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, is_unread: false } : item));
    await gmailApi(`/messages/${encodeURIComponent(message.id)}`, { method: "PATCH", body: "{}" }).catch(() => undefined);
  }

  function reply(message: GmailMessage) {
    const recipient = message.direction === "inbound" ? message.sender_email || "" : message.recipient_emails[0] || "";
    setCompose({
      to: recipient,
      subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
      body: "",
      threadId: message.thread_id,
      orderId: message.legacy_order_id,
    });
  }

  async function sendMessage() {
    if (!compose?.to.trim() || !compose.subject.trim() || !compose.body.trim()) {
      setError("Заполните получателя, тему и сообщение.");
      return;
    }
    setSending(true);
    setError("");
    try {
      await gmailApi("/messages", {
        method: "POST",
        body: JSON.stringify({
          to: compose.to.trim(),
          subject: compose.subject.trim(),
          body: compose.body.trim(),
          thread_id: compose.threadId || null,
          legacy_order_id: compose.orderId || null,
        }),
      });
      setCompose(null);
      await loadMailbox(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось отправить письмо.");
    } finally {
      setSending(false);
    }
  }

  if (loading && !status) return <div style={{ ...panelStyle, padding: 28 }}>Загружаем рабочую почту…</div>;

  if (!status?.connected) {
    return (
      <section style={{ ...panelStyle, maxWidth: 720, padding: 30 }}>
        <div style={{ fontSize: 42 }}>✉️</div>
        <h2 style={{ margin: "12px 0 8px", fontSize: 25 }}>Рабочая почта не подключена</h2>
        <p style={{ color: "#64748b", lineHeight: 1.6 }}>Подключение идёт через Google OAuth. Пароль Gmail в CRM не сохраняется.</p>
        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {canConnect ? <a href="/api/v1/integrations/gmail/connect" style={{ display: "inline-block", marginTop: 14, padding: "11px 18px", borderRadius: 10, background: "#2563eb", color: "white", fontWeight: 800 }}>Подключить Gmail</a> : null}
      </section>
    );
  }

  return (
    <>
      {error ? <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#b91c1c" }}>{error}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 390px) minmax(0, 1fr)", gap: 16, minHeight: "68vh" }}>
        <section style={{ ...panelStyle, overflow: "hidden" }}>
          <div style={{ padding: 18, borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div><strong>{status.email_address}</strong><div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>{messages.length} писем · {messages.filter((message) => message.is_unread).length} непрочитано</div></div>
              <button type="button" onClick={() => void loadMailbox(true)} disabled={loading} style={{ padding: "8px 11px", border: "1px solid #cbd5e1", borderRadius: 9, background: "white", cursor: "pointer" }}>{loading ? "…" : "↻"}</button>
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по почте…" style={{ width: "100%", marginTop: 14, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10 }} />
            <button type="button" onClick={() => setCompose({ to: "", subject: "", body: "" })} style={{ width: "100%", marginTop: 10, padding: "10px 12px", border: 0, borderRadius: 10, background: "#2563eb", color: "white", fontWeight: 800, cursor: "pointer" }}>+ Новое письмо</button>
          </div>
          <div style={{ maxHeight: "58vh", overflow: "auto" }}>
            {filtered.map((message) => (
              <button key={message.id} type="button" onClick={() => void selectMessage(message)} style={{ width: "100%", padding: 14, textAlign: "left", border: 0, borderBottom: "1px solid #e2e8f0", background: selected?.id === message.id ? "#eff6ff" : "white", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ color: message.is_unread ? "#1d4ed8" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message.direction === "inbound" ? "↙" : "↗"} {displayContact(message)}</strong><span style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap" }}>{displayDate(message.sent_at)}</span></div>
                <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message.subject || "(без темы)"}</div>
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message.snippet || message.body}</div>
              </button>
            ))}
          </div>
        </section>
        <section style={{ ...panelStyle, padding: 24, minWidth: 0 }}>
          {selected ? <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, borderBottom: "1px solid #e2e8f0", paddingBottom: 18 }}>
              <div><div style={{ color: "#2563eb", fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>{selected.direction === "inbound" ? "Входящее" : "Исходящее"}</div><h2 style={{ margin: "6px 0", fontSize: 22 }}>{selected.subject || "(без темы)"}</h2><div style={{ color: "#64748b" }}>{displayContact(selected)} · {displayDate(selected.sent_at)}</div></div>
              <button type="button" onClick={() => reply(selected)} style={{ alignSelf: "flex-start", padding: "10px 15px", border: 0, borderRadius: 10, background: "#2563eb", color: "white", fontWeight: 800, cursor: "pointer" }}>Ответить</button>
            </div>
            <div style={{ marginTop: 22, whiteSpace: "pre-wrap", lineHeight: 1.7, color: "#334155" }}>{selected.body || selected.snippet}</div>
            {selected.attachments?.length ? <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 8 }}>{selected.attachments.map((file, index) => file.attachment_id ? <a key={`${file.attachment_id}-${index}`} href={`/api/v1/integrations/gmail/messages/${encodeURIComponent(selected.id)}/attachments/${encodeURIComponent(file.attachment_id)}`} style={{ padding: "8px 11px", borderRadius: 9, background: "#f1f5f9", color: "#334155" }}>📎 {file.name || "Файл"}</a> : null)}</div> : null}
          </> : <div style={{ color: "#64748b" }}>Выберите письмо слева.</div>}
        </section>
      </div>
      {compose ? <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.55)", display: "grid", placeItems: "center", padding: 20 }}>
        <section style={{ ...panelStyle, width: "min(680px, 100%)", padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Новое письмо</h2>
          <input value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} placeholder="Кому" style={{ width: "100%", padding: 11, border: "1px solid #cbd5e1", borderRadius: 9 }} />
          <input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} placeholder="Тема" style={{ width: "100%", marginTop: 10, padding: 11, border: "1px solid #cbd5e1", borderRadius: 9 }} />
          <textarea value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} placeholder="Сообщение" rows={12} style={{ width: "100%", marginTop: 10, padding: 11, border: "1px solid #cbd5e1", borderRadius: 9, resize: "vertical" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}><button type="button" onClick={() => setCompose(null)} style={{ padding: "10px 15px", border: "1px solid #cbd5e1", borderRadius: 9, background: "white" }}>Отмена</button><button type="button" onClick={() => void sendMessage()} disabled={sending} style={{ padding: "10px 15px", border: 0, borderRadius: 9, background: "#2563eb", color: "white", fontWeight: 800 }}>{sending ? "Отправляем…" : "Отправить"}</button></div>
        </section>
      </div> : null}
    </>
  );
}
