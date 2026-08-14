"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Grid3X3,
  Inbox,
  Mail,
  Menu,
  MoreVertical,
  Paperclip,
  Pencil,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./gmail-mailbox.module.css";

type GmailStatus = {
  connected: boolean;
  email_address: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
};

type GmailAttachment = { name?: string; mime_type?: string; attachment_id?: string | null };

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

type ComposeState = { to: string; subject: string; body: string; threadId?: string; orderId?: string | null };
type MailFolder = "inbox" | "starred" | "snoozed" | "sent" | "drafts" | "all";
type InboxCategory = "primary" | "clients" | "updates" | "unread";

async function gmailApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/integrations/gmail${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => null) as null | { data?: T; errors?: Array<{ message?: string }> };
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
  const sameDay = date.toDateString() === new Date().toDateString();
  if (compact && sameDay) return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat("ru-RU", compact
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
  ).format(date);
}

function isClientMessage(message: GmailMessage) {
  if (message.legacy_order_id) return true;
  const address = `${message.sender_email || ""} ${message.sender_name || ""}`.toLowerCase();
  return message.direction === "inbound" && !/(no.?reply|notification|notice|support|google|zadarma|newsletter|marketing)/i.test(address);
}

function isUpdateMessage(message: GmailMessage) {
  return /(call|звон|record|запис|delivery|payment|оплат|order|заказ|appointment|встреч|schedule)/i.test(`${message.subject} ${message.snippet}`);
}

export function GmailMailbox({ canConnect }: { canConnect: boolean }) {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [category, setCategory] = useState<InboxCategory>("primary");
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
      } else setMessages([]);
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

  const inboxCount = messages.filter((message) => message.direction === "inbound").length;
  const unreadCount = messages.filter((message) => message.direction === "inbound" && message.is_unread).length;
  const clientCount = messages.filter(isClientMessage).length;
  const updateCount = messages.filter(isUpdateMessage).length;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return messages.filter((message) => {
      if (folder === "inbox" && message.direction !== "inbound") return false;
      if (folder === "sent" && message.direction !== "outbound") return false;
      if (folder === "starred" && !starredIds.has(message.id)) return false;
      if (folder === "snoozed" || folder === "drafts") return false;
      if (folder === "inbox" && category === "clients" && !isClientMessage(message)) return false;
      if (folder === "inbox" && category === "updates" && !isUpdateMessage(message)) return false;
      if (folder === "inbox" && category === "unread" && !message.is_unread) return false;
      if (!normalized) return true;
      return [message.subject, message.sender_email, message.sender_name, message.body, ...message.recipient_emails]
        .join(" ").toLowerCase().includes(normalized);
    });
  }, [category, folder, messages, query, starredIds]);

  const selected = messages.find((message) => message.id === selectedId) || null;
  const allVisibleSelected = filtered.length > 0 && filtered.every((message) => selectedIds.has(message.id));

  async function selectMessage(message: GmailMessage) {
    setSelectedId(message.id);
    if (!message.is_unread) return;
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, is_unread: false } : item));
    await gmailApi(`/messages/${encodeURIComponent(message.id)}`, { method: "PATCH", body: "{}" }).catch(() => undefined);
  }

  function changeFolder(nextFolder: MailFolder) {
    setFolder(nextFolder);
    setSelectedId(null);
    setSelectedIds(new Set());
    if (nextFolder !== "inbox") setCategory("primary");
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filtered.forEach((message) => next.delete(message.id));
      else filtered.forEach((message) => next.add(message.id));
      return next;
    });
  }

  function toggleStar(id: string) {
    setStarredIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function reply(message: GmailMessage) {
    setCompose({
      to: message.direction === "inbound" ? message.sender_email || "" : message.recipient_emails[0] || "",
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
    } finally { setSending(false); }
  }

  if (loading && !status) return <div className={styles.loading}><span className={styles.spinner} />Загружаем почту…</div>;

  if (!status?.connected) {
    return (
      <main className={styles.connectPage}>
        <Image src="/landing/rolan-logo.webp" alt="ROLANPRO" width={220} height={72} priority />
        <section className={styles.connectPanel}>
          <Mail size={42} strokeWidth={1.5} />
          <h1>Рабочая почта не подключена</h1>
          <p>Подключение выполняется через Google. Пароль Gmail в CRM не сохраняется.</p>
          {error ? <p className={styles.connectError}>{error}</p> : null}
          {canConnect ? <a href="/api/v1/integrations/gmail/connect" className={styles.connectButton}>Подключить Google Mail</a> : null}
        </section>
      </main>
    );
  }

  const folderTitle: Record<MailFolder, string> = {
    inbox: "Входящие", starred: "Помеченные", snoozed: "Отложенные", sent: "Отправленные", drafts: "Черновики", all: "Вся почта",
  };

  return (
    <main className={`${styles.gmailApp} ${sidebarOpen ? "" : styles.sidebarCompact}`}>
      <header className={styles.topbar}>
        <div className={styles.brandArea}>
          <button type="button" className={styles.roundButton} onClick={() => setSidebarOpen((value) => !value)} aria-label="Главное меню"><Menu /></button>
          <Link href="/legacy-crm" className={styles.brand} aria-label="Вернуться в ROLANPRO CRM">
            <Image src="/landing/rolan-logo.webp" alt="ROLANPRO" width={112} height={38} priority />
            <span>Почта</span>
          </Link>
        </div>
        <label className={styles.searchBox}>
          <Search />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск в почте" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск"><X /></button> : <SlidersHorizontal />}
        </label>
        <div className={styles.topActions}>
          <button type="button" className={styles.roundButton} title="Помощь"><CircleHelp /></button>
          <Link href={canConnect ? "/owner/settings" : "/manager"} className={styles.roundButton} title="Настройки"><Settings /></Link>
          <button type="button" className={`${styles.roundButton} ${styles.geminiButton}`} title="AI-помощник"><Sparkles /></button>
          <Link href="/legacy-crm" className={styles.roundButton} title="Приложения ROLANPRO"><Grid3X3 /></Link>
          <div className={styles.avatar} title={status.email_address || "Google Mail"}>{(status.email_address || "R").charAt(0).toUpperCase()}</div>
        </div>
      </header>

      {error ? <div className={styles.errorBanner}>{error}<button type="button" onClick={() => setError("")}><X /></button></div> : null}

      <div className={styles.appBody}>
        <aside className={styles.sidebar}>
          <button type="button" className={styles.composeButton} onClick={() => setCompose({ to: "", subject: "", body: "" })}><Pencil /><span>Написать</span></button>
          <nav aria-label="Папки почты">
            <button type="button" className={folder === "inbox" ? styles.folderActive : styles.folder} onClick={() => changeFolder("inbox")}><Inbox /><span>Входящие</span><strong>{unreadCount || ""}</strong></button>
            <button type="button" className={folder === "starred" ? styles.folderActive : styles.folder} onClick={() => changeFolder("starred")}><Star /><span>Помеченные</span></button>
            <button type="button" className={folder === "snoozed" ? styles.folderActive : styles.folder} onClick={() => changeFolder("snoozed")}><Clock3 /><span>Отложенные</span></button>
            <button type="button" className={folder === "sent" ? styles.folderActive : styles.folder} onClick={() => changeFolder("sent")}><Send /><span>Отправленные</span></button>
            <button type="button" className={folder === "drafts" ? styles.folderActive : styles.folder} onClick={() => changeFolder("drafts")}><FileText /><span>Черновики</span><strong>0</strong></button>
            <button type="button" className={folder === "all" ? styles.folderActive : styles.folder} onClick={() => changeFolder("all")}><Archive /><span>Вся почта</span></button>
            <button type="button" className={styles.folder}><ChevronDown /><span>Ещё</span></button>
          </nav>
          <div className={styles.labelsTitle}><strong>Ярлыки</strong><button type="button" aria-label="Добавить ярлык">+</button></div>
          <div className={styles.labelItem}><Tag /><span>Клиенты CRM</span><strong>{clientCount}</strong></div>
          <div className={styles.labelItem}><Tag /><span>Заказы</span><strong>{messages.filter((message) => message.legacy_order_id).length}</strong></div>
          <div className={styles.accountMeta}><strong>{status.email_address}</strong><span>{messages.length} писем синхронизировано</span></div>
        </aside>

        <section className={styles.mailSurface}>
          {selected ? (
            <article className={styles.reader}>
              <div className={styles.toolbar}>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="Назад"><ArrowLeft /></button>
                <button type="button" aria-label="Архивировать"><Archive /></button>
                <button type="button" aria-label="Удалить"><Trash2 /></button>
                <button type="button" onClick={() => toggleStar(selected.id)} aria-label="Пометить"><Star className={starredIds.has(selected.id) ? styles.starred : ""} /></button>
                <button type="button" aria-label="Другие действия"><MoreVertical /></button>
                <div className={styles.toolbarSpacer} />
                <button type="button" aria-label="Предыдущее письмо"><ChevronLeft /></button>
                <button type="button" aria-label="Следующее письмо"><ChevronRight /></button>
              </div>
              <div className={styles.readerContent}>
                <div className={styles.readerTitleRow}><h1>{selected.subject || "(без темы)"}</h1>{selected.legacy_order_id ? <span>Заказ {selected.legacy_order_id}</span> : null}</div>
                <div className={styles.senderRow}>
                  <div className={styles.senderAvatar}>{displayContact(selected).charAt(0).toUpperCase()}</div>
                  <div className={styles.senderDetails}><strong>{displayContact(selected)}</strong><span>{selected.direction === "inbound" ? "кому: мне" : `кому: ${displayAddress(selected)}`}</span></div>
                  <time>{displayDate(selected.sent_at)}</time>
                  <button type="button" onClick={() => toggleStar(selected.id)} aria-label="Пометить"><Star className={starredIds.has(selected.id) ? styles.starred : ""} /></button>
                  <button type="button" onClick={() => reply(selected)} aria-label="Ответить"><Reply /></button>
                  <button type="button" aria-label="Ещё"><MoreVertical /></button>
                </div>
                <div className={styles.messageBody}>{selected.body || selected.snippet}</div>
                {selected.attachments?.length ? <div className={styles.attachments}>{selected.attachments.map((file, index) => file.attachment_id ? <a key={`${file.attachment_id}-${index}`} href={`/api/v1/integrations/gmail/messages/${encodeURIComponent(selected.id)}/attachments/${encodeURIComponent(file.attachment_id)}`}><Paperclip />{file.name || "Файл"}</a> : null)}</div> : null}
                <button type="button" className={styles.replyButton} onClick={() => reply(selected)}><Reply />Ответить</button>
              </div>
            </article>
          ) : (
            <div className={styles.inboxView}>
              <div className={styles.toolbar}>
                <label className={styles.selectAll}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Выбрать все письма" /><ChevronDown /></label>
                <button type="button" onClick={() => void loadMailbox(true)} disabled={loading} aria-label="Обновить"><RefreshCw className={loading ? styles.spinning : ""} /></button>
                <button type="button" aria-label="Другие действия"><MoreVertical /></button>
                <div className={styles.toolbarSpacer} />
                <span className={styles.range}>{filtered.length ? `1–${filtered.length} из ${filtered.length}` : "0 из 0"}</span>
                <button type="button" aria-label="Предыдущая страница" disabled><ChevronLeft /></button>
                <button type="button" aria-label="Следующая страница"><ChevronRight /></button>
              </div>

              {folder === "inbox" ? <div className={styles.categories}>
                <button type="button" className={category === "primary" ? styles.categoryActive : styles.category} onClick={() => setCategory("primary")}><Inbox /><span><strong>Основные</strong><small>{inboxCount} писем</small></span></button>
                <button type="button" className={category === "clients" ? styles.categoryActive : styles.category} onClick={() => setCategory("clients")}><Users /><span><strong>Клиенты</strong><small>{clientCount} писем</small></span></button>
                <button type="button" className={category === "updates" ? styles.categoryActive : styles.category} onClick={() => setCategory("updates")}><CheckSquare /><span><strong>Оповещения</strong><small>{updateCount} писем</small></span></button>
                <button type="button" className={category === "unread" ? styles.categoryActive : styles.category} onClick={() => setCategory("unread")}><Mail /><span><strong>Непрочитанные</strong><small>{unreadCount} новых</small></span></button>
              </div> : <div className={styles.folderHeading}>{folderTitle[folder]}</div>}

              <div className={styles.messageList}>
                {filtered.length ? filtered.map((message) => (
                  <div key={message.id} className={message.is_unread ? styles.messageUnread : styles.messageRow} role="button" tabIndex={0} onClick={() => void selectMessage(message)} onKeyDown={(event) => { if (event.key === "Enter") void selectMessage(message); }}>
                    <input type="checkbox" checked={selectedIds.has(message.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(message.id)} aria-label={`Выбрать письмо от ${displayContact(message)}`} />
                    <button type="button" onClick={(event) => { event.stopPropagation(); toggleStar(message.id); }} aria-label={starredIds.has(message.id) ? "Снять пометку" : "Пометить"}><Star className={starredIds.has(message.id) ? styles.starred : ""} /></button>
                    <strong className={styles.contact}>{displayContact(message)}</strong>
                    <span className={styles.subject}><strong>{message.subject || "(без темы)"}</strong><span> — {message.snippet || message.body}</span></span>
                    {message.attachments?.length ? <Paperclip className={styles.paperclip} aria-label="Есть вложение" /> : <span />}
                    <time>{displayDate(message.sent_at, true)}</time>
                  </div>
                )) : <div className={styles.emptyState}><Mail /><strong>В папке нет писем</strong><span>{query ? "Измените запрос поиска." : "Письма появятся после синхронизации."}</span></div>}
              </div>
            </div>
          )}
        </section>
      </div>

      {compose ? <section className={styles.composeWindow} role="dialog" aria-label="Новое письмо">
        <header><strong>{compose.threadId ? "Ответ" : "Новое сообщение"}</strong><button type="button" onClick={() => setCompose(null)} aria-label="Закрыть"><X /></button></header>
        <label><span>Кому</span><input value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} autoFocus /></label>
        <label><span>Тема</span><input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} /></label>
        <textarea value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} placeholder="Напишите сообщение" />
        <footer><button type="button" onClick={() => void sendMessage()} disabled={sending}>{sending ? "Отправляем…" : "Отправить"}<ChevronDown /></button><span>Отправка через {status.email_address}</span></footer>
      </section> : null}
    </main>
  );
}
