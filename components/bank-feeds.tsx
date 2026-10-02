"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { bankNeedsRefresh } from "@/features/bank/refresh";

import styles from "./bank-feeds.module.css";

type Category = { code: string; label: string; kind: "expense" | "income" | "transfer" };
type Account = {
  accountId: string; connectionId: string; institution: string; name: string; mask: string | null;
  type: string; subtype: string | null; current: number | null; available: number | null; limit: number | null;
  currency: string; updatedAt: string | null;
};
type Connection = { connectionId: string; institution: string; status: string; errorCode: string | null; lastSyncedAt: string | null };
type Transaction = {
  transactionId: string; accountId: string; date: string; name: string; merchant: string | null; amount: number;
  pending: boolean; category: string | null; reviewStatus: string; note: string | null;
};
type Overview = {
  settings: { configured: boolean; environment: "sandbox" | "production"; clientIdHint: string | null };
  connections: Connection[]; accounts: Account[]; totals: { cash: number; cardDebt: number };
  reviewCount: number; hasMore: boolean; categories: Category[]; transactions: Transaction[];
};

const PAGE_SIZE = 200;


type PlaidHandler = { open: () => void; destroy?: () => void };
type PlaidGlobal = {
  create: (options: {
    token: string;
    onSuccess: (publicToken: string, metadata: unknown) => void;
    onExit?: (error: { display_message?: string | null; error_message?: string } | null) => void;
  }) => PlaidHandler;
};

const PLAID_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
const AUTO_SYNC_AFTER_MS = 6 * 60 * 60 * 1000;

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function loadPlaid(): Promise<PlaidGlobal> {
  const existing = (window as unknown as { Plaid?: PlaidGlobal }).Plaid;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PLAID_SCRIPT;
    script.async = true;
    script.onload = () => {
      const plaid = (window as unknown as { Plaid?: PlaidGlobal }).Plaid;
      if (plaid) resolve(plaid);
      else reject(new Error("Plaid не загрузился."));
    };
    script.onerror = () => reject(new Error("Не удалось загрузить окно Plaid. Проверьте интернет."));
    document.head.appendChild(script);
  });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const payload = (await response.json().catch(() => null)) as { data?: T; errors?: Array<{ message?: string }> } | null;
  if (!response.ok || !payload || payload.data === undefined) {
    throw new Error(payload?.errors?.[0]?.message || "Не удалось выполнить запрос.");
  }
  return payload.data;
}

function closePanel() {
  if (window.top && window.top !== window) {
    window.top.postMessage({ type: "rolanpro-bank-close" }, window.location.origin);
  } else {
    window.location.href = "/legacy-crm";
  }
}

function SettingsForm({ current, onSaved, onCancel }: {
  current: Overview["settings"] | null; onSaved: () => void; onCancel?: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">(current?.environment ?? "sandbox");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/v1/finance/bank/settings", {
        method: "PUT",
        body: JSON.stringify({ client_id: clientId.trim(), secret: secret.trim(), environment }),
      });
      setSecret("");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={save}>
      <h2>Ключи Plaid</h2>
      <p className={styles.muted}>
        Plaid Dashboard → Developers → Keys. Ключи хранятся на сервере в зашифрованном виде и больше нигде не показываются.
        {current?.configured ? ` Сейчас сохранён client_id ${current.clientIdHint}.` : ""}
      </p>
      <label className={styles.field}>client_id
        <input value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" required />
      </label>
      <label className={styles.field}>secret {current?.configured ? "(оставьте пустым, чтобы не менять)" : ""}
        <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="new-password" required={!current?.configured} />
      </label>
      <label className={styles.field}>Режим
        <select value={environment} onChange={(event) => setEnvironment(event.target.value === "production" ? "production" : "sandbox")}>
          <option value="sandbox">Sandbox — тестовый банк Plaid</option>
          <option value="production">Production — ваши настоящие банки (Trial plan)</option>
        </select>
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.actions}>
        <button className={styles.primary} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить ключи"}</button>
        {onCancel ? <button type="button" className={styles.secondary} onClick={onCancel}>Отмена</button> : null}
      </div>
    </form>
  );
}

export function BankFeeds() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"review" | "all">("review");
  const [remember, setRemember] = useState<Record<string, boolean>>({});
  const [editingKeys, setEditingKeys] = useState(false);

  // The «Разобрать» tab asks the server for unreviewed operations only, page by page,
  // so every operation counted in «Разобрать» can be reached. `count` keeps the rows already shown.
  const load = useCallback(async (count = PAGE_SIZE) => {
    try {
      const review = tab === "review" ? "1" : "0";
      setOverview(await api<Overview>(`/api/v1/finance/bank/overview?review=${review}&limit=${Math.max(PAGE_SIZE, count)}`));
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "Не удалось загрузить." });
    } finally {
      setLoading(false);
    }
  }, [tab]);

  async function loadMore() {
    if (!overview) return;
    setBusy("more");
    try {
      const review = tab === "review" ? "1" : "0";
      const next = await api<Overview>(`/api/v1/finance/bank/overview?review=${review}&limit=${PAGE_SIZE}&offset=${overview.transactions.length}`);
      setOverview({ ...next, transactions: [...overview.transactions, ...next.transactions] });
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "Не удалось загрузить." });
    } finally {
      setBusy("");
    }
  }

  const sync = useCallback(async (quiet = false) => {
    setBusy("sync");
    try {
      const { results } = await api<{ results: Array<{ ok: boolean; added?: number; message?: string }> }>("/api/v1/finance/bank/sync", { method: "POST", body: "{}" });
      const failed = results.filter((result) => !result.ok);
      const added = results.reduce((sum, result) => sum + (result.added ?? 0), 0);
      if (!quiet || failed.length) {
        setNotice(failed.length
          ? { tone: "error", text: `Не все банки обновились: ${failed.map((result) => result.message).join("; ")}` }
          : { tone: "ok", text: `Операции обновлены${added ? `: новых ${added}` : ""}.` });
      }
      await load();
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "Не удалось обновить." });
    } finally {
      setBusy("");
    }
  }, [load]);

  useEffect(() => { void load(); }, [load]);

  // Opening the screen refreshes operations when any bank never loaded or loaded more than six hours ago.
  useEffect(() => {
    if (!overview?.settings.configured || !overview.connections.length) return;
    if (bankNeedsRefresh(overview.connections, Date.now(), AUTO_SYNC_AFTER_MS) && !busy) void sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview?.settings.configured, overview?.connections.length]);

  async function openLink(connectionId?: string) {
    setBusy(connectionId ? `relogin:${connectionId}` : "connect");
    setNotice(null);
    try {
      const [{ linkToken }, Plaid] = await Promise.all([
        api<{ linkToken: string }>("/api/v1/finance/bank/link-token", { method: "POST", body: JSON.stringify({ connection_id: connectionId ?? null }) }),
        loadPlaid(),
      ]);
      const handler = Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken) => {
          setBusy("connect");
          try {
            if (connectionId) {
              await sync();
            } else {
              const result = await api<{ institutionName: string | null; added: number }>("/api/v1/finance/bank/connections", {
                method: "POST",
                body: JSON.stringify({ public_token: publicToken }),
              });
              setNotice({ tone: "ok", text: `${result.institutionName ?? "Банк"} подключён. Загружено операций: ${result.added}.` });
              await load();
            }
          } catch (cause) {
            setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "Не удалось подключить банк." });
          } finally {
            setBusy("");
          }
        },
        onExit: (error) => {
          if (error) setNotice({ tone: "error", text: error.display_message || error.error_message || "Подключение прервано." });
          setBusy("");
        },
      });
      handler.open();
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "Не удалось открыть Plaid." });
      setBusy("");
    }
  }

  async function setCategory(tx: Transaction, categoryCode: string) {
    setBusy(`tx:${tx.transactionId}`);
    try {
      const result = await api<{ appliedToOthers: number }>(`/api/v1/finance/bank/transactions/${tx.transactionId}`, {
        method: "PATCH",
        body: JSON.stringify({ category_code: categoryCode, remember: Boolean(remember[tx.transactionId]) }),
      });
      setNotice({ tone: "ok", text: result.appliedToOthers ? `Сохранено. Правило применено ещё к ${result.appliedToOthers} операциям.` : "Сохранено." });
      await load(overview?.transactions.length);
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "Не удалось сохранить." });
    } finally {
      setBusy("");
    }
  }

  const accountsById = useMemo(() => new Map((overview?.accounts ?? []).map((account) => [account.accountId, account])), [overview]);
  const shown = overview?.transactions ?? [];
  const grouped = useMemo(() => {
    const kinds: Array<[Category["kind"], string]> = [["expense", "Расходы"], ["income", "Доходы"], ["transfer", "Не расход и не доход"]];
    return kinds.map(([kind, label]) => ({ label, items: (overview?.categories ?? []).filter((category) => category.kind === kind) }));
  }, [overview]);

  return (
    <div className={styles.shell}><main className={styles.page}>
      <header className={styles.header}>
        <div>
          <button type="button" className={styles.back} onClick={closePanel}>← В CRM</button>
          <h1>Счета и карты</h1>
          <p className={styles.muted}>Балансы и операции из банков — сами, каждый день. Вход в банк происходит на странице банка, пароли в CRM не попадают.</p>
        </div>
        {overview?.settings.configured ? (
          <div className={styles.actions}>
            <button className={styles.primary} onClick={() => void openLink()} disabled={Boolean(busy)}>{busy === "connect" ? "Подключаю…" : "+ Подключить банк или карту"}</button>
            <button className={styles.secondary} onClick={() => void sync()} disabled={Boolean(busy) || !overview.connections.length}>{busy === "sync" ? "Обновляю…" : "Обновить операции"}</button>
            <button className={styles.secondary} onClick={() => setEditingKeys(true)} disabled={Boolean(busy)}>Ключи Plaid</button>
          </div>
        ) : null}
      </header>

      {notice ? <p className={notice.tone === "ok" ? styles.ok : styles.error} role="status">{notice.text}</p> : null}
      {loading ? <p className={styles.muted}>Загружаю…</p> : null}

      {!loading && (!overview?.settings.configured || editingKeys) ? (
        <SettingsForm
          current={overview?.settings ?? null}
          onSaved={() => { setEditingKeys(false); setNotice({ tone: "ok", text: "Ключи сохранены." }); void load(); }}
          onCancel={overview?.settings.configured ? () => setEditingKeys(false) : undefined}
        />
      ) : null}

      {overview?.settings.configured ? (
        <>
          {overview.settings.environment === "sandbox" ? (
            <p className={styles.warning}>Режим Sandbox: здесь тестовый банк Plaid (логин user_good, пароль pass_good). Для настоящих счетов переключите режим на Production в «Ключи Plaid».</p>
          ) : null}

          <section className={styles.totals}>
            <div className={styles.total}><span>Деньги на счетах</span><strong>{money(overview.totals.cash)}</strong></div>
            <div className={styles.total}><span>Долг по картам</span><strong>{money(overview.totals.cardDebt)}</strong></div>
            <div className={styles.total}><span>Разобрать</span><strong>{overview.reviewCount}</strong></div>
          </section>

          <section className={styles.card}>
            <h2>Счета</h2>
            {overview.connections.length === 0 ? <p className={styles.muted}>Пока ни одного банка. Нажмите «Подключить банк или карту».</p> : null}
            {overview.connections.map((connection) => (
              <div key={connection.connectionId} className={styles.bank}>
                <div className={styles.bankHead}>
                  <strong>{connection.institution}</strong>
                  <span className={styles.muted}>{connection.lastSyncedAt ? `обновлено ${new Date(connection.lastSyncedAt).toLocaleString("ru-RU")}` : "ещё не загружено"}</span>
                  {connection.status !== "active" ? (
                    <button className={styles.secondary} onClick={() => void openLink(connection.connectionId)} disabled={Boolean(busy)}>
                      {connection.status === "login_required" ? "Войти в банк заново" : `Ошибка ${connection.errorCode ?? ""} — переподключить`}
                    </button>
                  ) : null}
                </div>
                {overview.accounts.filter((account) => account.connectionId === connection.connectionId).map((account) => (
                  <div key={account.accountId} className={styles.account}>
                    <span>{account.name}{account.mask ? ` ••${account.mask}` : ""} <em className={styles.muted}>{account.type === "credit" ? "карта" : account.subtype ?? account.type}</em></span>
                    <strong>{money(account.current)}</strong>
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className={styles.card}>
            <div className={styles.tabs}>
              <button className={tab === "review" ? styles.tabActive : styles.tab} onClick={() => setTab("review")}>Разобрать ({overview.reviewCount})</button>
              <button className={tab === "all" ? styles.tabActive : styles.tab} onClick={() => setTab("all")}>Все операции</button>
            </div>
            {shown.length === 0 ? <p className={styles.muted}>{tab === "review" ? "Всё разобрано." : "Операций пока нет."}</p> : null}
            <ul className={styles.list}>
              {shown.map((tx) => {
                const account = accountsById.get(tx.accountId);
                const incoming = tx.amount < 0;
                return (
                  <li key={tx.transactionId} className={styles.tx}>
                    <div className={styles.txMain}>
                      <div>
                        <strong>{tx.merchant || tx.name}</strong>
                        <div className={styles.muted}>{tx.date} · {account ? `${account.name}${account.mask ? ` ••${account.mask}` : ""}` : ""}{tx.pending ? " · в обработке" : ""}</div>
                      </div>
                      <strong className={incoming ? styles.income : styles.expense}>{incoming ? "+" : "−"}{money(Math.abs(tx.amount))}</strong>
                    </div>
                    <div className={styles.txControls}>
                      <select
                        aria-label="Категория"
                        value={tx.category ?? ""}
                        disabled={busy === `tx:${tx.transactionId}`}
                        onChange={(event) => void setCategory(tx, event.target.value)}
                      >
                        {grouped.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.items.map((category) => <option key={category.code} value={category.code}>{category.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <label className={styles.remember}>
                        <input type="checkbox" checked={Boolean(remember[tx.transactionId])} onChange={(event) => setRemember({ ...remember, [tx.transactionId]: event.target.checked })} />
                        Запомнить для похожих
                      </label>
                      {tx.reviewStatus === "needs_review" ? (
                        <button className={styles.secondary} onClick={() => void setCategory(tx, tx.category ?? "OTHER_EXPENSE")} disabled={Boolean(busy)}>Верно</button>
                      ) : <span className={styles.muted}>{tx.reviewStatus === "confirmed" ? "проверено" : "авто"}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {overview.hasMore ? (
              <button className={styles.secondary} onClick={() => void loadMore()} disabled={Boolean(busy)}>{busy === "more" ? "Загружаю…" : "Показать ещё"}</button>
            ) : null}
          </section>
        </>
      ) : null}
    </main></div>
  );
}
