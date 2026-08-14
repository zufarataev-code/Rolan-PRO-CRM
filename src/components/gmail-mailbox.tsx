"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import styles from "./gmail-mailbox.module.css";

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

type MailFolder = "inbox" | "sent" | "all";

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

function displayAddress(message: GmailMessage) {
  if (message.direction === "inbound") return message.sender_email || message.sender_name || "Клиент";
  return message.recipient_emails.join(", ") || "Получатель";
}

function displayDate(value: string, compact = false) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (compact && sameDay) {
    return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("ru-RU", compact
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
  ).format(date);
}

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return <span className={styles.icon} style={{ width: size, height: size }} aria-hidden="true">{children}</span>;
}

function SearchIcon() {
  return <Icon><svg viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg></Icon>;
}

function MailIcon() {
  return <Icon size={24}><svg viewBox="0 0 24 24"><path d="M3 6.5 12 13l9-6.5M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg></Icon>;
}

function InboxIcon() {
  return <Icon><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM4 14h4l2 3h4l2-3h4" /></svg></Icon>;
}

function SentIcon() {
  return <Icon><svg viewBox="0 0 24 24"><path d="m3 11 18-8-8 18-2-8-8-2Zm8 2 10-10" /></svg></Icon>;
}

function StackIcon() {
  return <Icon><svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></svg></Icon>;
}

function PencilIcon() {
  return <Icon><svg viewBox="0 0 24 24"><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Zm9.5-13 3.5 3.5M15 5.5l2-2a1.4 1.4 0 0 1 2 0L20.5 5a1.4 1.4 0 0 1 0 2l-2 2" /></svg></Icon>;
}

function RefreshIcon() {
  return <Icon><svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5m10.2-3A8 8 0 0 0 5.7 6.3L4 8m16 8-1.7 1.7A8 8 0 0 1 4.8 14" /></svg></Icon>;
}

function BackIcon() {
  return <Icon><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7M8 12h12" /></svg></Icon>;
}

function ReplyIcon() {
  return <Icon><svg viewBox="0 0 24 24"><path d="m10 8-6 5 6 5v-3c5 0 8 1 10 4-1-6-4-9-10-9V8Z" /></svg></Icon>;
}

function CloseIcon() {
  return <Icon><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg></Icon>;
}

export function GmailMailbox({ canConnect }: { canConnect: boolean }) {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<MailFolder>("inbox");
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

  const unreadCount = messages.filter((message) => message.direction === "inbound" && message.is_unread).length;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return messages.filter((message) => {
      if (folder === "inbox" && message.direction !== "inbound") return false;
      if (folder === "sent" && message.direction !== "outbound") return false;
      if (!normalized) return true;
      return [
        message.subject,
        message.sender_email,
        message.sender_name,
        message.body,
        ...message.recipient_emails,
      ].join(" ").toLowerCase().includes(normalized);
    });
  }, [folder, messages, query]);

  const selected = messages.find((message) => message.id === selectedId) || null;

  async function selectMessage(message: GmailMessage) {
    setSelectedId(message.id);
    if (!message.is_unread) return;
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, is_unread: false } : item));
    await gmailApi(`/messages/${encodeURIComponent(message.id)}`, { method: "PATCH", body: "{}" }).catch(() => undefined);
  }

  function changeFolder(nextFolder: MailFolder) {
    setFolder(nextFolder);
    setSelectedId(null);
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
      setFolder("sent");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось отправить письмо.");
    } finally {
      setSending(false);
    }
  }

  if (loading && !status) {
    return <div className={styles.loading}><span className={styles.spinner} />Загружаем рабочую почту…</div>;
  }

  if (!status?.connected) {
    return (
      <section className={styles.connectPanel}>
        <div className={styles.gmailMark}><MailIcon /></div>
        <h2>Рабочая почта не подключена</h2>
        <p>Подключение выполняется через Google. Пароль Gmail в CRM не сохраняется.</p>
        {error ? <p className={styles.connectError}>{error}</p> : null}
        {canConnect ? <a href="/api/v1/integrations/gmail/connect" className={styles.connectButton}>Подключить Google Mail</a> : null}
      </section>
    );
  }

  const folderTitle = folder === "inbox" ? "Входящие" : folder === "sent" ? "Отправленные" : "Вся почта";

  return (
    <div className={styles.mailApp}>
      <header className={styles.mailHeader}>
        <div className={styles.brand}><span className={styles.gmailMark}><MailIcon /></span><span>Почта</span></div>
        <label className={styles.search}>
          <SearchIcon />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск в почте" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск"><CloseIcon /></button> : null}
        </label>
        <div className={styles.account} title={status.email_address || "Google Mail"}>
          <span>{(status.email_address || "R").charAt(0).toUpperCase()}</span>
        </div>
      </header>

      {error ? <div className={styles.errorBanner}>{error}<button type="button" onClick={() => setError("")}><CloseIcon /></button></div> : null}

      <div className={styles.mailBody}>
        <aside className={styles.sidebar}>
          <button type="button" className={styles.composeButton} onClick={() => setCompose({ to: "", subject: "", body: "" })}>
            <PencilIcon /> <span>Написать</span>
          </button>
          <nav aria-label="Папки почты">
            <button type="button" className={folder === "inbox" ? styles.folderActive : styles.folder} onClick={() => changeFolder("inbox")}>
              <InboxIcon /><span>Входящие</span>{unreadCount ? <strong>{unreadCount}</strong> : null}
            </button>
            <button type="button" className={folder === "sent" ? styles.folderActive : styles.folder} onClick={() => changeFolder("sent")}>
              <SentIcon /><span>Отправленные</span>
            </button>
            <button type="button" className={folder === "all" ? styles.folderActive : styles.folder} onClick={() => changeFolder("all")}>
              <StackIcon /><span>Вся почта</span>
            </button>
          </nav>
          <div className={styles.mailboxMeta}>
            <strong>{status.email_address}</strong>
            <span>{messages.length} писем в CRM</span>
          </div>
        </aside>

        <main className={styles.workspace}>
          {selected ? (
            <article className={styles.reader}>
              <div className={styles.readerToolbar}>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="Вернуться к списку"><BackIcon /></button>
                <button type="button" onClick={() => void loadMailbox(true)} disabled={loading} aria-label="Обновить"><RefreshIcon /></button>
              </div>
              <div className={styles.readerContent}>
                <div className={styles.readerTitleRow}>
                  <h2>{selected.subject || "(без темы)"}</h2>
                  {selected.legacy_order_id ? <span className={styles.orderBadge}>Заказ {selected.legacy_order_id}</span> : null}
                </div>
                <div className={styles.senderRow}>
                  <div className={styles.senderAvatar}>{displayContact(selected).charAt(0).toUpperCase()}</div>
                  <div className={styles.senderDetails}>
                    <strong>{displayContact(selected)}</strong>
                    <span>{selected.direction === "inbound" ? "кому: мне" : `кому: ${displayAddress(selected)}`}</span>
                  </div>
                  <time>{displayDate(selected.sent_at)}</time>
                  <button type="button" className={styles.iconButton} onClick={() => reply(selected)} aria-label="Ответить"><ReplyIcon /></button>
                </div>
                <div className={styles.messageBody}>{selected.body || selected.snippet}</div>
                {selected.attachments?.length ? (
                  <div className={styles.attachments}>
                    {selected.attachments.map((file, index) => file.attachment_id ? (
                      <a key={`${file.attachment_id}-${index}`} href={`/api/v1/integrations/gmail/messages/${encodeURIComponent(selected.id)}/attachments/${encodeURIComponent(file.attachment_id)}`}>
                        <span>📎</span>{file.name || "Файл"}
                      </a>
                    ) : null)}
                  </div>
                ) : null}
                <button type="button" className={styles.replyButton} onClick={() => reply(selected)}><ReplyIcon /> Ответить</button>
              </div>
            </article>
          ) : (
            <section className={styles.inbox}>
              <div className={styles.listToolbar}>
                <h2>{folderTitle}</h2>
                <div>
                  <span>{filtered.length ? `1–${filtered.length} из ${filtered.length}` : "0 писем"}</span>
                  <button type="button" onClick={() => void loadMailbox(true)} disabled={loading} aria-label="Обновить почту" className={loading ? styles.refreshing : ""}><RefreshIcon /></button>
                </div>
              </div>
              <div className={styles.messageList}>
                {filtered.length ? filtered.map((message) => (
                  <button key={message.id} type="button" onClick={() => void selectMessage(message)} className={message.is_unread ? styles.messageUnread : styles.messageRow}>
                    <span className={styles.unreadDot} />
                    <strong className={styles.contact}>{displayContact(message)}</strong>
                    <span className={styles.subject}>{message.subject || "(без темы)"}<span> — {message.snippet || message.body}</span></span>
                    {message.attachments?.length ? <span className={styles.paperclip} aria-label="Есть вложение">⌕</span> : null}
                    <time>{displayDate(message.sent_at, true)}</time>
                  </button>
                )) : (
                  <div className={styles.emptyState}><MailIcon /><strong>Здесь пока нет писем</strong><span>{query ? "Попробуйте изменить запрос поиска." : "Новые письма появятся после синхронизации."}</span></div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      {compose ? (
        <section className={styles.composeWindow} role="dialog" aria-modal="false" aria-label="Новое письмо">
          <header><strong>{compose.threadId ? "Ответ" : "Новое сообщение"}</strong><button type="button" onClick={() => setCompose(null)} aria-label="Закрыть"><CloseIcon /></button></header>
          <label><span>Кому</span><input value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} autoFocus /></label>
          <label><span>Тема</span><input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} /></label>
          <textarea value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} placeholder="Напишите сообщение" />
          <footer>
            <button type="button" className={styles.sendButton} onClick={() => void sendMessage()} disabled={sending}>{sending ? "Отправляем…" : "Отправить"}</button>
            <span>Отправка через {status.email_address}</span>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
