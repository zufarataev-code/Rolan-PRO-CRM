"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createCardForServiceType, getServiceTypeById } from "@/features/calculator/logic";
import type { CalculatorBootstrap, CalculatorCard } from "@/features/calculator/types";

type DealOption = {
  deal_id: string;
  deal_code: string;
  title: string;
  client_name: string | null;
  lead_name: string | null;
  status_name: string | null;
};

type QuickLine = {
  id: string;
  serviceTypeId: string;
  quantity: number;
  clientRate: number;
  materialRate: number;
  installationRate: number;
  coefficient: number;
  extraCost: number;
};

type Props = {
  bootstrap: CalculatorBootstrap;
  deals: DealOption[];
  initialDealId?: string | null;
  showInternalEconomics: boolean;
  monthlyOverhead: number;
  recommendedFixedCost: number;
  targetNetMarginPercent: number;
};

let idSequence = 0;
function nextId(prefix: string) {
  idSequence += 1;
  return `${prefix}-${idSequence}`;
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

function newLine(bootstrap: CalculatorBootstrap): QuickLine {
  const service = bootstrap.service_types[0] ?? null;
  return {
    id: nextId("quick"),
    serviceTypeId: service?.service_type_id ?? "",
    quantity: 0,
    clientRate: service?.base_price ?? 0,
    materialRate: service?.material_cost_per_sqft ?? 0,
    installationRate: service?.installation_cost_per_sqft ?? 0,
    coefficient: 1,
    extraCost: 0,
  };
}

async function readApi(response: Response) {
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message ?? "Операция не выполнена.");
  }
  return payload.data;
}

export function QuickEstimateCalculator({
  bootstrap,
  deals,
  initialDealId = null,
  showInternalEconomics,
  monthlyOverhead,
  recommendedFixedCost,
  targetNetMarginPercent,
}: Props) {
  const router = useRouter();
  const [lines, setLines] = useState<QuickLine[]>([newLine(bootstrap)]);
  const [fixedCost, setFixedCost] = useState(recommendedFixedCost);
  const [selectedDealId, setSelectedDealId] = useState(initialDealId ?? "");
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const totals = useMemo(() => {
    const rows = lines.map((line) => {
      const service = getServiceTypeById(bootstrap.service_types, line.serviceTypeId);
      const quantity = Math.max(0, Number(line.quantity) || 0);
      const coefficient = Math.max(0.1, Number(line.coefficient) || 1);
      const clientRevenue = quantity * Math.max(0, Number(line.clientRate) || 0) * coefficient;
      const materialCost = quantity * Math.max(0, Number(line.materialRate) || 0);
      const installationCost = quantity * Math.max(0, Number(line.installationRate) || 0) * coefficient;
      const extraCost = Math.max(0, Number(line.extraCost) || 0);
      const directCost = materialCost + installationCost + extraCost;
      const catalogRevenue = quantity * Math.max(0, service?.base_price ?? 0) * coefficient;
      return {
        line,
        service,
        quantity,
        coefficient,
        clientRevenue: round(clientRevenue),
        catalogRevenue: round(catalogRevenue),
        materialCost: round(materialCost),
        installationCost: round(installationCost),
        extraCost: round(extraCost),
        directCost: round(directCost),
      };
    });

    const clientRevenue = rows.reduce((sum, row) => sum + row.clientRevenue, 0);
    const catalogRevenue = rows.reduce((sum, row) => sum + row.catalogRevenue, 0);
    const materialCost = rows.reduce((sum, row) => sum + row.materialCost, 0);
    const installationCost = rows.reduce((sum, row) => sum + row.installationCost, 0);
    const extraCost = rows.reduce((sum, row) => sum + row.extraCost, 0);
    const directCost = materialCost + installationCost + extraCost;
    const fullCost = directCost + (showInternalEconomics ? Math.max(0, Number(fixedCost) || 0) : 0);
    const targetMarginRatio = Math.min(0.85, Math.max(0, targetNetMarginPercent / 100));
    const targetPrice = targetMarginRatio < 1 ? fullCost / (1 - targetMarginRatio) : fullCost;
    const profit = clientRevenue - fullCost;
    const margin = clientRevenue > 0 ? (profit / clientRevenue) * 100 : 0;

    return {
      rows,
      clientRevenue: round(clientRevenue),
      catalogRevenue: round(catalogRevenue),
      materialCost: round(materialCost),
      installationCost: round(installationCost),
      extraCost: round(extraCost),
      directCost: round(directCost),
      fullCost: round(fullCost),
      targetPrice: round(targetPrice),
      profit: round(profit),
      margin: round(margin),
    };
  }, [bootstrap.service_types, fixedCost, lines, showInternalEconomics, targetNetMarginPercent]);

  const economicSignal = !showInternalEconomics
    ? null
    : totals.clientRevenue < totals.fullCost
      ? { label: "Ниже полной себестоимости", tone: "#b91c1c", bg: "#fef2f2" }
      : totals.clientRevenue < totals.targetPrice
        ? { label: "Расходы покрыты, но ниже цели", tone: "#a16207", bg: "#fffbeb" }
        : { label: "Цена соответствует экономической цели", tone: "#15803d", bg: "#f0fdf4" };

  function updateLine(lineId: string, updater: (line: QuickLine) => QuickLine) {
    setLines((current) => current.map((line) => line.id === lineId ? updater(line) : line));
  }

  function changeService(lineId: string, serviceTypeId: string) {
    const service = getServiceTypeById(bootstrap.service_types, serviceTypeId);
    updateLine(lineId, (line) => ({
      ...line,
      serviceTypeId,
      clientRate: service?.base_price ?? 0,
      materialRate: service?.material_cost_per_sqft ?? 0,
      installationRate: service?.installation_cost_per_sqft ?? 0,
    }));
  }

  function addLine() {
    setLines((current) => [...current, newLine(bootstrap)]);
  }

  function removeLine(lineId: string) {
    setLines((current) => current.length > 1 ? current.filter((line) => line.id !== lineId) : current);
  }

  async function resolveDealId() {
    if (selectedDealId) return selectedDealId;
    const name = newContactName.trim();
    if (!name) throw new Error("Выберите существующую сделку или быстро создайте нового клиента/лид.");

    const lead = await readApi(await fetch("/api/v1/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone: newContactPhone.trim() || undefined,
        email: newContactEmail.trim() || undefined,
        source: "quick_calculator",
        notes: `Предварительный расчет: ${money(totals.clientRevenue)}`,
      }),
    }));

    const deal = await readApi(await fetch("/api/v1/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: lead.lead_id,
        title: `${name} · предварительный расчет`,
        estimated_value: totals.clientRevenue,
        currency: "USD",
        notes: "Создано из быстрого калькулятора. Детальные комнаты, окна и пленка заполняются позже в проекте.",
      }),
    }));

    setSelectedDealId(deal.deal_id);
    return deal.deal_id as string;
  }

  function calculatorCards(): CalculatorCard[] {
    return lines
      .filter((line) => line.serviceTypeId && Number(line.quantity) > 0)
      .map((line) => {
        const card = createCardForServiceType(bootstrap, line.serviceTypeId);
        return {
          ...card,
          dynamic_fields: {
            ...card.dynamic_fields,
            sqft: Math.max(0, Number(line.quantity) || 0),
            quick_estimate: true,
            complexity_multiplier: Math.max(0.1, Number(line.coefficient) || 1),
          },
          pricing: {
            ...card.pricing,
            // Bake the rough complexity factor into the customer rate. The
            // detailed project later replaces this with room/window pricing.
            service_unit_price_override:
              Math.max(0, Number(line.clientRate) || 0) * Math.max(0.1, Number(line.coefficient) || 1),
          },
          notes: "Предварительный расчет. Точная пленка, комнаты, окна и монтаж уточняются на следующем этапе.",
        };
      });
  }

  async function saveDraftProposal() {
    if (totals.clientRevenue <= 0) {
      setMessage("Сначала укажите услугу и примерный объем.");
      return;
    }
    setSaving(true);
    setMessage("Сохраняю…");
    try {
      const dealId = await resolveDealId();
      const cards = calculatorCards();
      const proposal = await readApi(await fetch("/api/v1/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: dealId, calculator_cards: cards }),
      }));
      setMessage("Черновик расчета сохранен в сделку.");
      router.push(`/manager/crm/proposals/${proposal.proposal.proposal_id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить расчет.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="surface" style={{ padding: 18 }}>
        <div className="page-kicker">БЫСТРЫЙ КАЛЬКУЛЯТОР</div>
        <h2 className="detail-heading" style={{ margin: "4px 0" }}>Сколько назвать клиенту прямо сейчас?</h2>
        <div className="detail-meta">
          <span>Без комнат и окон. Только ориентир во время разговора.</span>
          <span>Детальный расчет появится уже после перехода к объекту/проекту.</span>
        </div>
      </section>

      {lines.map((line, index) => {
        const row = totals.rows[index];
        const service = row?.service ?? null;
        return (
          <section key={line.id} className="surface" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <strong>Услуга {index + 1}</strong>
              <button type="button" className="soft-button" disabled={lines.length === 1} onClick={() => removeLine(line.id)}>Удалить</button>
            </div>
            <div className="calculator-grid">
              <label className="calculator-field">
                <span>Услуга</span>
                <select value={line.serviceTypeId} onChange={(event) => changeService(line.id, event.target.value)}>
                  {bootstrap.service_types.map((item) => <option key={item.service_type_id} value={item.service_type_id}>{item.name_ru}</option>)}
                </select>
              </label>
              <label className="calculator-field">
                <span>Примерный объем, sqft</span>
                <input type="number" min="0" step="1" value={line.quantity || ""} onChange={(event) => updateLine(line.id, (current) => ({ ...current, quantity: Math.max(0, Number(event.target.value) || 0) }))} />
              </label>
              <label className="calculator-field">
                <span>Прайс / sqft</span>
                <input type="number" value={service?.base_price ?? 0} readOnly />
              </label>
              <label className="calculator-field">
                <span>Цена клиенту / sqft</span>
                <input type="number" min="0" step="0.01" value={line.clientRate} onChange={(event) => updateLine(line.id, (current) => ({ ...current, clientRate: Math.max(0, Number(event.target.value) || 0) }))} />
              </label>
              <label className="calculator-field">
                <span>Коэффициент сложности</span>
                <select value={line.coefficient} onChange={(event) => updateLine(line.id, (current) => ({ ...current, coefficient: Number(event.target.value) }))}>
                  <option value={1}>1.00 · обычный</option>
                  <option value={1.15}>1.15 · лестница</option>
                  <option value={1.25}>1.25 · lift / сложнее</option>
                  <option value={1.35}>1.35 · scaffold</option>
                  <option value={1.5}>1.50 · высокая сложность</option>
                </select>
              </label>
              {showInternalEconomics ? <>
                <label className="calculator-field">
                  <span>Материал / sqft</span>
                  <input type="number" min="0" step="0.01" value={line.materialRate} onChange={(event) => updateLine(line.id, (current) => ({ ...current, materialRate: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
                <label className="calculator-field">
                  <span>Монтаж / sqft</span>
                  <input type="number" min="0" step="0.01" value={line.installationRate} onChange={(event) => updateLine(line.id, (current) => ({ ...current, installationRate: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
                <label className="calculator-field">
                  <span>Доп. расходы</span>
                  <input type="number" min="0" step="1" value={line.extraCost || ""} placeholder="lift, бензин, парковка…" onChange={(event) => updateLine(line.id, (current) => ({ ...current, extraCost: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
              </> : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <span className="chip chip-accent">Клиенту: {money(row?.clientRevenue ?? 0)}</span>
              <span className="chip">По прайсу: {money(row?.catalogRevenue ?? 0)}</span>
              {showInternalEconomics ? <>
                <span className="chip">Материал: {money(row?.materialCost ?? 0)}</span>
                <span className="chip">Монтаж: {money(row?.installationCost ?? 0)}</span>
              </> : null}
            </div>
          </section>
        );
      })}

      <button type="button" className="soft-button" style={{ justifySelf: "start" }} onClick={addLine}>+ Добавить услугу</button>

      {showInternalEconomics ? (
        <section className="surface" style={{ padding: 18 }}>
          <div className="page-kicker">ЭКОНОМИКА · ТОЛЬКО ВЛАДЕЛЕЦ</div>
          <div className="calculator-grid" style={{ marginTop: 10 }}>
            <label className="calculator-field">
              <span>Доля постоянных расходов на этот заказ</span>
              <input type="number" min="0" step="1" value={fixedCost} onChange={(event) => setFixedCost(Math.max(0, Number(event.target.value) || 0))} />
              <small>Система рекомендует {money(recommendedFixedCost)}. Месячные постоянные расходы: {money(monthlyOverhead)}.</small>
            </label>
            <label className="calculator-field">
              <span>Целевая чистая маржа</span>
              <input type="text" value={`${targetNetMarginPercent.toFixed(1)}%`} readOnly />
              <small>Расчет из текущего финансового плана компании.</small>
            </label>
          </div>

          {economicSignal ? (
            <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: economicSignal.bg, color: economicSignal.tone, fontWeight: 800 }}>
              {economicSignal.label}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="surface" style={{ padding: 18 }}>
        <div className="page-kicker">ПОДСКАЗКА ПО ЦЕНЕ</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 10 }}>
          <div className="card"><div className="row-meta">По прайсу</div><strong>{money(totals.catalogRevenue)}</strong></div>
          <div className="card"><div className="row-meta">Вы называете клиенту</div><strong>{money(totals.clientRevenue)}</strong></div>
          {showInternalEconomics ? <>
            <div className="card"><div className="row-meta">Материал</div><strong>{money(totals.materialCost)}</strong></div>
            <div className="card"><div className="row-meta">Монтаж</div><strong>{money(totals.installationCost)}</strong></div>
            <div className="card"><div className="row-meta">Доп. расходы</div><strong>{money(totals.extraCost)}</strong></div>
            <div className="card"><div className="row-meta">Полная себестоимость</div><strong>{money(totals.fullCost)}</strong></div>
            <div className="card"><div className="row-meta">Рекомендуемая цена</div><strong>{money(totals.targetPrice)}</strong></div>
            <div className="card"><div className="row-meta">Прибыль / маржа</div><strong>{money(totals.profit)} · {totals.margin}%</strong></div>
          </> : null}
        </div>
      </section>

      <section className="surface" style={{ padding: 18 }}>
        <div className="page-kicker">СОХРАНИТЬ, ЕСЛИ КЛИЕНТ ЗАИНТЕРЕСОВАН</div>
        <h3 className="detail-heading" style={{ margin: "4px 0 10px" }}>Привязать расчет к сделке</h3>
        <div className="calculator-grid">
          <label className="calculator-field">
            <span>Существующий клиент / сделка</span>
            <select value={selectedDealId} onChange={(event) => setSelectedDealId(event.target.value)}>
              <option value="">— создать нового ниже —</option>
              {deals.map((deal) => (
                <option key={deal.deal_id} value={deal.deal_id}>
                  {deal.deal_code} · {deal.client_name || deal.lead_name || deal.title} · {deal.status_name || ""}
                </option>
              ))}
            </select>
          </label>
          <label className="calculator-field">
            <span>Новый клиент / лид</span>
            <input value={newContactName} onChange={(event) => setNewContactName(event.target.value)} placeholder="Имя или компания" disabled={Boolean(selectedDealId)} />
          </label>
          <label className="calculator-field">
            <span>Телефон</span>
            <input value={newContactPhone} onChange={(event) => setNewContactPhone(event.target.value)} placeholder="(805) ..." disabled={Boolean(selectedDealId)} />
          </label>
          <label className="calculator-field">
            <span>Email</span>
            <input type="email" value={newContactEmail} onChange={(event) => setNewContactEmail(event.target.value)} placeholder="client@email.com" disabled={Boolean(selectedDealId)} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
          <button type="button" className="accent-button" onClick={saveDraftProposal} disabled={saving}>
            {saving ? "Сохраняю…" : "Сохранить как черновик КП"}
          </button>
          <span className="row-meta">Проект и PRJ-номер появятся позже — только после договора и аванса.</span>
        </div>
        {message ? <div style={{ marginTop: 10 }} className="row-meta">{message}</div> : null}
      </section>
    </div>
  );
}
