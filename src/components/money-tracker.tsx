"use client";

import { useEffect, useMemo, useState } from "react";

type ScopeOption = {
  id: string;
  type: "deal" | "project";
  code: string;
  title: string;
  client_name: string;
  deal_id?: string | null;
};

type ExpenseItem = {
  expense_id: string;
  scope_type: "deal" | "project";
  scope_id: string | null;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  created_at: string;
  created_by: { user_id: string; full_name: string } | null;
};

type PlannedItem = {
  label: string;
  amount: number;
};

type Props = {
  scopes: ScopeOption[];
  isOwner: boolean;
};

const CATEGORIES = [
  "Material",
  "Lift / Scaffold",
  "Delivery",
  "Parking",
  "Electrician",
  "Subcontractor",
  "Fuel / Mileage",
  "Tools / Supplies",
  "Rental",
  "Permit / Fee",
  "Other",
];

const PAYMENT_METHODS = ["Card", "ACH / Bank", "Zelle", "Check", "Cash", "Other"];

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function localDateInput() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

async function api(responseInput: Response | Promise<Response>) {
  const response = await responseInput;
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message ?? "Операция не выполнена.");
  }
  return payload.data;
}

export function MoneyTracker({ scopes, isOwner }: Props) {
  const [selectedKey, setSelectedKey] = useState(scopes[0] ? `${scopes[0].type}:${scopes[0].id}` : "");
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [planned, setPlanned] = useState<PlannedItem[]>([]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [paidAt, setPaidAt] = useState(localDateInput());
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selected = useMemo(
    () => scopes.find((scope) => `${scope.type}:${scope.id}` === selectedKey) ?? null,
    [scopes, selectedKey],
  );

  const plannedDealId = selected?.type === "deal" ? selected.id : selected?.deal_id ?? null;

  async function reload() {
    if (!selected) {
      setItems([]);
      setPlanned([]);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const expenseData = await api(fetch(
        `/api/v1/finance/expenses?scope_type=${encodeURIComponent(selected.type)}&scope_id=${encodeURIComponent(selected.id)}`,
        { cache: "no-store" },
      ));
      setItems(Array.isArray(expenseData.items) ? expenseData.items : []);

      if (plannedDealId) {
        const plannedData = await api(fetch(`/api/v1/deals/${plannedDealId}/planned-expenses`, { cache: "no-store" }));
        setPlanned(Array.isArray(plannedData.items) ? plannedData.items : []);
      } else {
        setPlanned([]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить расходы.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const actualTotal = useMemo(
    () => Number(items.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
    [items],
  );
  const plannedTotal = useMemo(
    () => Number(planned.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
    [planned],
  );
  const variance = Number((actualTotal - plannedTotal).toFixed(2));

  async function save() {
    if (!selected) {
      setMessage("Сначала выберите сделку или проект.");
      return;
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage("Введите сумму расхода больше нуля.");
      return;
    }

    setSaving(true);
    setMessage("Сохраняю фактический расход…");
    try {
      await api(fetch("/api/v1/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope_type: selected.type,
          scope_id: selected.id,
          category,
          amount: numericAmount,
          payment_method: paymentMethod,
          paid_at: `${paidAt}T12:00:00.000Z`,
          description: description.trim(),
        }),
      }));
      setAmount("");
      setDescription("");
      setMessage(`Расход ${money(numericAmount)} записан.`);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось записать расход.");
    } finally {
      setSaving(false);
    }
  }

  if (scopes.length === 0) {
    return (
      <section className="surface" style={{ padding: 18, color: "#132435" }}>
        <h2 style={{ margin: 0 }}>Money Tracker</h2>
        <p style={{ color: "#667b91" }}>Нет доступных сделок или проектов. Сначала создайте сделку.</p>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, color: "#132435" }}>
      <section className="surface" style={{ padding: 16 }}>
        <div className="page-kicker">ERP · MONEY TRACKER</div>
        <h2 className="detail-heading" style={{ margin: "4px 0" }}>Фактические расходы проекта</h2>
        <div className="detail-meta">
          <span>План в калькуляторе → факт здесь → отклонение видно сразу. Записывайте расход в день оплаты.</span>
        </div>
      </section>

      <section className="surface" style={{ padding: 16 }}>
        <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
          <span>Сделка / проект</span>
          <select
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            style={{ minHeight: 44, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 10px", background: "#fff" }}
          >
            {scopes.map((scope) => (
              <option key={`${scope.type}:${scope.id}`} value={`${scope.type}:${scope.id}`}>
                {scope.type === "project" ? "PROJECT" : "DEAL"} · {scope.code} · {scope.client_name} · {scope.title}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <div className="surface" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>ПЛАН ДОП. РАСХОДОВ</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{money(plannedTotal)}</div>
        </div>
        <div className="surface" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>ФАКТ</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{money(actualTotal)}</div>
        </div>
        <div className="surface" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>ОТКЛОНЕНИЕ</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4, color: variance > 0 ? "#b91c1c" : "#15803d" }}>
            {plannedTotal > 0 ? `${variance > 0 ? "+" : ""}${money(variance)}` : "—"}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            {plannedTotal > 0 ? (variance > 0 ? "Перерасход" : "В пределах плана") : "План не задан"}
          </div>
        </div>
      </section>

      <section className="surface" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>+ Записать фактический расход</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span>Категория</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} style={{ minHeight: 42, borderRadius: 9, border: "1px solid #cbd5e1", padding: "0 9px", background: "#fff" }}>
              {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span>Сумма, $</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" style={{ minHeight: 42, borderRadius: 9, border: "1px solid #cbd5e1", padding: "0 9px", background: "#fff" }} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span>Оплачено</span>
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} style={{ minHeight: 42, borderRadius: 9, border: "1px solid #cbd5e1", padding: "0 9px", background: "#fff" }}>
              {PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span>Дата</span>
            <input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} style={{ minHeight: 42, borderRadius: 9, border: "1px solid #cbd5e1", padding: "0 9px", background: "#fff" }} />
          </label>
        </div>
        <label style={{ display: "grid", gap: 5, marginTop: 10 }}>
          <span>Комментарий</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Например: 45 ft lift, Sunbelt" style={{ minHeight: 42, borderRadius: 9, border: "1px solid #cbd5e1", padding: "0 9px", background: "#fff" }} />
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="primary-button" disabled={saving} onClick={save}>
            {saving ? "Сохраняю…" : "Записать расход"}
          </button>
          <span style={{ fontSize: 13, color: message.includes("не") ? "#b91c1c" : "#475569" }}>{message}</span>
        </div>
      </section>

      <section className="surface" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <strong>Фактические расходы</strong>
          <span style={{ fontSize: 13, color: "#64748b" }}>{loading ? "Обновляю…" : `${items.length} записей`}</span>
        </div>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 12, color: "#64748b" }}>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }}>Дата</th>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }}>Категория</th>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }}>Комментарий</th>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }}>Метод</th>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }}>Кто</th>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0", textAlign: "right" }}>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.expense_id} style={{ fontSize: 14 }}>
                  <td style={{ padding: "9px 6px", borderBottom: "1px solid #f1f5f9" }}>{new Date(item.paid_at).toLocaleDateString("en-US")}</td>
                  <td style={{ padding: "9px 6px", borderBottom: "1px solid #f1f5f9", fontWeight: 700 }}>{item.category}</td>
                  <td style={{ padding: "9px 6px", borderBottom: "1px solid #f1f5f9" }}>{item.description || "—"}</td>
                  <td style={{ padding: "9px 6px", borderBottom: "1px solid #f1f5f9" }}>{item.payment_method || "—"}</td>
                  <td style={{ padding: "9px 6px", borderBottom: "1px solid #f1f5f9" }}>{item.created_by?.full_name ?? "—"}</td>
                  <td style={{ padding: "9px 6px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontWeight: 800 }}>{money(item.amount)}</td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#64748b" }}>Пока нет фактических расходов.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {isOwner ? (
        <section className="surface" style={{ padding: 14, fontSize: 13, color: "#64748b" }}>
          Владелец видит те же фактические расходы, что внесла команда. Плановые расходы берутся из быстрого калькулятора сделки. Полная компания P&amp;L и банковские остатки остаются отдельным финансовым уровнем и не показываются менеджеру.
        </section>
      ) : null}
    </div>
  );
}
