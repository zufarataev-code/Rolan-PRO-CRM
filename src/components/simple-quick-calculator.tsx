"use client";

import { useEffect, useMemo, useState } from "react";

import { createCardForServiceType, getServiceTypeById } from "@/features/calculator/logic";
import type { CalculatorBootstrap, CalculatorCard } from "@/features/calculator/types";

type DealOption = {
  deal_id: string;
  deal_code: string;
  title: string;
  contact_name: string;
  status_name: string;
};

type Line = {
  id: string;
  service_type_id: string;
  sqft: number;
  client_rate: number;
  material_rate: number;
  install_rate: number;
  coefficient: number;
};

type PlannedExpense = {
  id: string;
  label: string;
  amount: number;
};

type Props = {
  bootstrap: CalculatorBootstrap;
  deals: DealOption[];
  initialDealId?: string | null;
  showInternalEconomics: boolean;
  monthlyOverhead: number;
  recommendedOverheadPerDeal: number;
  targetProfitPerDeal: number;
};

let sequence = 0;
function id(prefix = "line") {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

function round(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function makeLine(bootstrap: CalculatorBootstrap): Line {
  const service = bootstrap.service_types[0];
  return {
    id: id(),
    service_type_id: service?.service_type_id ?? "",
    sqft: 0,
    client_rate: service?.base_price ?? 0,
    material_rate: service?.material_cost_per_sqft ?? 0,
    install_rate: service?.installation_cost_per_sqft ?? 0,
    coefficient: 1,
  };
}

function makeExpense(label = "", amount = 0): PlannedExpense {
  return { id: id("expense"), label, amount };
}

async function api(responseInput: Response | Promise<Response>) {
  const response = await responseInput;
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message ?? "Операция не выполнена.");
  }
  return payload.data;
}

export function SimpleQuickCalculator({
  bootstrap,
  deals,
  initialDealId = null,
  showInternalEconomics,
  monthlyOverhead,
  recommendedOverheadPerDeal,
  targetProfitPerDeal,
}: Props) {
  const [lines, setLines] = useState<Line[]>([makeLine(bootstrap)]);
  const [plannedExpenses, setPlannedExpenses] = useState<PlannedExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [overheadShare, setOverheadShare] = useState(round(recommendedOverheadPerDeal));
  const [selectedDealId, setSelectedDealId] = useState(initialDealId ?? "");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!selectedDealId) return;

    let cancelled = false;
    setLoadingExpenses(true);
    api(fetch(`/api/v1/deals/${selectedDealId}/planned-expenses`))
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data.items) ? data.items : [];
        setPlannedExpenses(items.map((item: any) => makeExpense(String(item.label ?? ""), Math.max(0, Number(item.amount) || 0))));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Не удалось загрузить плановые расходы.");
      })
      .finally(() => {
        if (!cancelled) setLoadingExpenses(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDealId]);

  const plannedExtraTotal = useMemo(
    () => round(plannedExpenses.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0)),
    [plannedExpenses],
  );

  const result = useMemo(() => {
    const rows = lines.map((line) => {
      const service = getServiceTypeById(bootstrap.service_types, line.service_type_id);
      const sqft = Math.max(0, Number(line.sqft) || 0);
      const coefficient = Math.max(0.1, Number(line.coefficient) || 1);
      const clientTotal = sqft * Math.max(0, line.client_rate) * coefficient;
      const listTotal = sqft * Math.max(0, service?.base_price ?? 0) * coefficient;
      const materialCost = sqft * Math.max(0, line.material_rate);
      const installCost = sqft * Math.max(0, line.install_rate) * coefficient;
      return {
        service,
        clientTotal: round(clientTotal),
        listTotal: round(listTotal),
        materialCost: round(materialCost),
        installCost: round(installCost),
      };
    });

    const clientTotal = rows.reduce((sum, row) => sum + row.clientTotal, 0);
    const listTotal = rows.reduce((sum, row) => sum + row.listTotal, 0);
    const materialCost = rows.reduce((sum, row) => sum + row.materialCost, 0);
    const installCost = rows.reduce((sum, row) => sum + row.installCost, 0);
    const extras = plannedExtraTotal;
    const overhead = showInternalEconomics ? Math.max(0, Number(overheadShare) || 0) : 0;
    const directCost = materialCost + installCost + extras;
    const fullCost = directCost + overhead;
    const recommendedPrice = fullCost + (showInternalEconomics ? Math.max(0, targetProfitPerDeal) : 0);
    const profit = clientTotal - fullCost;
    const margin = clientTotal > 0 ? (profit / clientTotal) * 100 : 0;

    return {
      rows,
      clientTotal: round(clientTotal),
      listTotal: round(listTotal),
      materialCost: round(materialCost),
      installCost: round(installCost),
      plannedExtraTotal: round(extras),
      afterPlannedExtras: round(clientTotal - extras),
      directCost: round(directCost),
      fullCost: round(fullCost),
      recommendedPrice: round(recommendedPrice),
      profit: round(profit),
      margin: round(margin),
    };
  }, [bootstrap.service_types, lines, overheadShare, plannedExtraTotal, showInternalEconomics, targetProfitPerDeal]);

  const signal = !showInternalEconomics
    ? null
    : result.clientTotal < result.fullCost
      ? { text: "Цена ниже полной себестоимости", bg: "#fef2f2", color: "#b91c1c" }
      : result.clientTotal < result.recommendedPrice
        ? { text: "Расходы покрыты, но цена ниже цели", bg: "#fffbeb", color: "#a16207" }
        : { text: "Цена соответствует цели", bg: "#f0fdf4", color: "#15803d" };

  function updateLine(lineId: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => line.id === lineId ? { ...line, ...patch } : line));
  }

  function updateExpense(expenseId: string, patch: Partial<PlannedExpense>) {
    setPlannedExpenses((current) => current.map((item) => item.id === expenseId ? { ...item, ...patch } : item));
  }

  function changeService(lineId: string, serviceTypeId: string) {
    const service = getServiceTypeById(bootstrap.service_types, serviceTypeId);
    updateLine(lineId, {
      service_type_id: serviceTypeId,
      client_rate: service?.base_price ?? 0,
      material_rate: service?.material_cost_per_sqft ?? 0,
      install_rate: service?.installation_cost_per_sqft ?? 0,
    });
  }

  async function resolveDealId() {
    if (selectedDealId) return selectedDealId;
    if (!contactName.trim()) throw new Error("Выберите сделку или укажите имя нового клиента.");

    const lead = await api(await fetch("/api/v1/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: contactName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        source: "quick_calculator",
        notes: `Предварительный расчет ${money(result.clientTotal)}`,
      }),
    }));

    const deal = await api(await fetch("/api/v1/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: lead.lead_id,
        title: `${contactName.trim()} · предварительный расчет`,
        estimated_value: result.clientTotal,
        currency: "USD",
        notes: "Создано из быстрого калькулятора. Детальный объект оформляется позже.",
      }),
    }));

    setSelectedDealId(deal.deal_id);
    return deal.deal_id as string;
  }

  function proposalCards(): CalculatorCard[] {
    return lines
      .filter((line) => line.service_type_id && line.sqft > 0)
      .map((line) => {
        const card = createCardForServiceType(bootstrap, line.service_type_id);
        return {
          ...card,
          dynamic_fields: {
            ...card.dynamic_fields,
            sqft: line.sqft,
            quick_estimate: true,
            complexity_multiplier: line.coefficient,
          },
          pricing: {
            ...card.pricing,
            service_unit_price_override: line.client_rate * line.coefficient,
          },
          notes: "Предварительный расчет. Точные размеры, комнаты, окна и пленка уточняются позже.",
        };
      });
  }

  async function savePlannedExpenses(dealId: string) {
    const items = plannedExpenses
      .filter((item) => item.label.trim() && Number(item.amount) > 0)
      .map((item) => ({ label: item.label.trim(), amount: round(Number(item.amount) || 0) }));

    await api(await fetch(`/api/v1/deals/${dealId}/planned-expenses`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    }));
  }

  async function save() {
    if (result.clientTotal <= 0) {
      setMessage("Введите услугу и примерный объем.");
      return;
    }

    setSaving(true);
    setMessage("Сохраняю…");
    try {
      const dealId = await resolveDealId();
      await api(await fetch(`/api/v1/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimated_value: result.clientTotal }),
      }));
      await savePlannedExpenses(dealId);
      const saved = await api(await fetch("/api/v1/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: dealId, calculator_cards: proposalCards() }),
      }));
      setMessage(`Сохранено в сделку. Доп. расходы: ${money(plannedExtraTotal)}. Черновик КП: ${saved.proposal.proposal_code ?? "создан"}.`);
      if (window.parent !== window) {
        window.parent.postMessage({ type: "rolanpro-calculator-saved", dealId }, window.location.origin);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить расчет.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section className="surface" style={{ padding: 16 }}>
        <div className="page-kicker">БЫСТРЫЙ РАСЧЕТ</div>
        <h2 className="detail-heading" style={{ margin: "4px 0" }}>Цена за минуту</h2>
        <div className="detail-meta"><span>Услуга → объем → коэффициент → цена. Без комнат и окон.</span></div>
      </section>

      {lines.map((line, index) => {
        const service = getServiceTypeById(bootstrap.service_types, line.service_type_id);
        return (
          <section key={line.id} className="surface" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <strong>Услуга {index + 1}</strong>
              <button type="button" className="soft-button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>Удалить</button>
            </div>
            <div className="calculator-grid">
              <label className="calculator-field"><span>Услуга</span><select value={line.service_type_id} onChange={(event) => changeService(line.id, event.target.value)}>{bootstrap.service_types.map((item) => <option key={item.service_type_id} value={item.service_type_id}>{item.name_ru}</option>)}</select></label>
              <label className="calculator-field"><span>Объем, sqft</span><input type="number" min="0" step="1" value={line.sqft || ""} onChange={(event) => updateLine(line.id, { sqft: Math.max(0, Number(event.target.value) || 0) })} /></label>
              <label className="calculator-field"><span>Прайс / sqft</span><input type="number" value={service?.base_price ?? 0} readOnly /></label>
              <label className="calculator-field"><span>Цена клиенту / sqft</span><input type="number" min="0" step="0.01" value={line.client_rate} onChange={(event) => updateLine(line.id, { client_rate: Math.max(0, Number(event.target.value) || 0) })} /></label>
              <label className="calculator-field"><span>Коэффициент</span><select value={line.coefficient} onChange={(event) => updateLine(line.id, { coefficient: Number(event.target.value) })}><option value={1}>1.00 · обычный</option><option value={1.15}>1.15 · лестница</option><option value={1.25}>1.25 · lift</option><option value={1.35}>1.35 · scaffold</option><option value={1.5}>1.50 · высокая сложность</option></select></label>
              {showInternalEconomics ? <>
                <label className="calculator-field"><span>Материал / sqft</span><input type="number" min="0" step="0.01" value={line.material_rate} onChange={(event) => updateLine(line.id, { material_rate: Math.max(0, Number(event.target.value) || 0) })} /></label>
                <label className="calculator-field"><span>Монтаж / sqft</span><input type="number" min="0" step="0.01" value={line.install_rate} onChange={(event) => updateLine(line.id, { install_rate: Math.max(0, Number(event.target.value) || 0) })} /></label>
              </> : null}
            </div>
          </section>
        );
      })}

      <button type="button" className="soft-button" style={{ justifySelf: "start" }} onClick={() => setLines((current) => [...current, makeLine(bootstrap)])}>+ Добавить услугу</button>

      <section className="surface" style={{ padding: 16 }}>
        <div className="page-kicker">ПЛАНОВЫЕ ДОП. РАСХОДЫ</div>
        <div className="detail-meta" style={{ marginTop: 4 }}><span>Менеджер может заложить lift, доставку, парковку, электрика, аренду и другие расходы объекта. Клиенту эти внутренние строки не отправляются.</span></div>
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {plannedExpenses.map((expense) => (
            <div key={expense.id} className="calculator-grid" style={{ alignItems: "end" }}>
              <label className="calculator-field"><span>Что за расход</span><input value={expense.label} placeholder="Например: Lift" onChange={(event) => updateExpense(expense.id, { label: event.target.value })} /></label>
              <label className="calculator-field"><span>Сумма</span><input type="number" min="0" step="1" value={expense.amount || ""} placeholder="0" onChange={(event) => updateExpense(expense.id, { amount: Math.max(0, Number(event.target.value) || 0) })} /></label>
              <button type="button" className="soft-button" onClick={() => setPlannedExpenses((current) => current.filter((item) => item.id !== expense.id))}>Удалить</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="soft-button" onClick={() => setPlannedExpenses((current) => [...current, makeExpense()])}>+ Доп. расход</button>
          <strong>План доп. расходов: {money(plannedExtraTotal)}</strong>
          {loadingExpenses ? <span className="row-meta">Загружаю расходы сделки…</span> : null}
        </div>
      </section>

      {showInternalEconomics ? (
        <section className="surface" style={{ padding: 16 }}>
          <div className="page-kicker">ЭКОНОМИКА · ТОЛЬКО ВЛАДЕЛЕЦ</div>
          <div className="calculator-grid" style={{ marginTop: 10 }}>
            <label className="calculator-field"><span>Постоянные расходы на заказ</span><input type="number" min="0" step="1" value={overheadShare} onChange={(event) => setOverheadShare(Math.max(0, Number(event.target.value) || 0))} /><small>Подсказка: {money(recommendedOverheadPerDeal)}. Месячный overhead: {money(monthlyOverhead)}.</small></label>
          </div>
          {signal ? <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: signal.bg, color: signal.color, fontWeight: 800 }}>{signal.text}</div> : null}
        </section>
      ) : null}

      <section className="surface" style={{ padding: 16 }}>
        <div className="page-kicker">ИТОГ И ПОДСКАЗКА</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 10 }}>
          <div className="card"><div className="row-meta">По прайсу</div><strong>{money(result.listTotal)}</strong></div>
          <div className="card"><div className="row-meta">Цена клиенту</div><strong>{money(result.clientTotal)}</strong></div>
          <div className="card"><div className="row-meta">План доп. расходов</div><strong>{money(result.plannedExtraTotal)}</strong></div>
          {!showInternalEconomics ? <div className="card"><div className="row-meta">Цена минус доп. расходы</div><strong>{money(result.afterPlannedExtras)}</strong><div className="row-meta">Это не прибыль: внутренние себестоимости скрыты.</div></div> : null}
          {showInternalEconomics ? <>
            <div className="card"><div className="row-meta">Материал</div><strong>{money(result.materialCost)}</strong></div>
            <div className="card"><div className="row-meta">Монтаж</div><strong>{money(result.installCost)}</strong></div>
            <div className="card"><div className="row-meta">Полная себестоимость</div><strong>{money(result.fullCost)}</strong></div>
            <div className="card"><div className="row-meta">Рекомендуемая цена</div><strong>{money(result.recommendedPrice)}</strong></div>
            <div className="card"><div className="row-meta">Прибыль / маржа</div><strong>{money(result.profit)} · {result.margin}%</strong></div>
          </> : null}
        </div>
      </section>

      <section className="surface" style={{ padding: 16 }}>
        <div className="page-kicker">ЕСЛИ КЛИЕНТ ЗАИНТЕРЕСОВАН</div>
        <div className="calculator-grid" style={{ marginTop: 10 }}>
          <label className="calculator-field"><span>Существующая сделка</span><select value={selectedDealId} onChange={(event) => { const value = event.target.value; setSelectedDealId(value); if (!value) setPlannedExpenses([]); }}><option value="">Создать нового клиента/лид</option>{deals.map((deal) => <option key={deal.deal_id} value={deal.deal_id}>{deal.deal_code} · {deal.contact_name} · {deal.status_name}</option>)}</select></label>
          <label className="calculator-field"><span>Имя / компания</span><input value={contactName} disabled={Boolean(selectedDealId)} onChange={(event) => setContactName(event.target.value)} /></label>
          <label className="calculator-field"><span>Телефон</span><input value={phone} disabled={Boolean(selectedDealId)} onChange={(event) => setPhone(event.target.value)} /></label>
          <label className="calculator-field"><span>Email</span><input type="email" value={email} disabled={Boolean(selectedDealId)} onChange={(event) => setEmail(event.target.value)} /></label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="accent-button" disabled={saving} onClick={save}>{saving ? "Сохраняю…" : "Сохранить расчет"}</button>
          <span className="row-meta">Сохраняется в сделку как черновик КП. Проект появится только после договора и аванса.</span>
        </div>
        {message ? <div className="row-meta" style={{ marginTop: 8 }}>{message}</div> : null}
      </section>
    </div>
  );
}
