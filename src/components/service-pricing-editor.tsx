"use client";

import { useMemo, useState } from "react";

export type PricingService = {
  service_type_id: string;
  service_code: string;
  name_ru: string;
  name_en: string;
  unit_type: string;
  base_price: number | string;
  min_price: number | string;
  block_revenue_price: number | string;
  material_cost_per_sqft: number | string;
  installation_cost_per_sqft: number | string;
  block_cost_price: number | string;
  is_active: boolean;
  sort_order: number | string;
};

export type PricingAddon = {
  service_addon_id: string;
  service_type_id: string;
  addon_code: string;
  name_ru: string;
  name_en: string;
  unit_type: string;
  default_price: number | string;
  min_price: number | string;
  cost_price: number | string;
  is_active: boolean;
  sort_order: number | string;
};

export type PlanningSnapshot = {
  assumptions: {
    average_deal_value: number;
    lead_to_deal_percent: number;
    target_profit_monthly: number;
    gross_margin_percent: number;
    monthly_overhead: number;
  };
  break_even: { revenue: number; deals: number; leads: number };
  target: { revenue: number; deals: number; leads: number };
  actual: {
    leads: number;
    deals: number;
    proposal_revenue: number;
    progress_percent: number;
    signal: "on_track" | "attention" | "risk";
  };
};

type Props = {
  initialServices: PricingService[];
  initialAddons: PricingAddon[];
  initialPlanning: PlanningSnapshot;
  canViewCosts: boolean;
};

type Notice = { kind: "saving" | "success" | "error"; message: string };

const fieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
} as const;

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

async function pricingRequest(method: "POST" | "PATCH", body: Record<string, unknown>) {
  const response = await fetch("/api/v1/settings/pricing", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: unknown;
    errors?: Array<{ message?: string }>;
  } | null;
  if (!response.ok) throw new Error(payload?.errors?.[0]?.message ?? "Не удалось сохранить изменения.");
  return payload?.data;
}

function Field({
  label,
  value,
  onChange,
  type = "number",
  step = "0.01",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "number";
  step?: string;
}) {
  return (
    <label>
      <span className="row-meta">{label}</span>
      <input type={type} step={type === "number" ? step : undefined} value={String(value)} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function ServicePricingEditor({ initialServices, initialAddons, initialPlanning, canViewCosts }: Props) {
  const [services, setServices] = useState(initialServices);
  const [addons, setAddons] = useState(initialAddons);
  const [planning, setPlanning] = useState(initialPlanning);
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const [newService, setNewService] = useState({ name_ru: "", service_code: "", unit_type: "sqft", base_price: "", min_price: "" });
  const [newAddon, setNewAddon] = useState({ service_type_id: initialServices[0]?.service_type_id ?? "", name_ru: "", addon_code: "", unit_type: "item", default_price: "", min_price: "" });

  const activeServices = useMemo(() => services.filter((service) => service.is_active), [services]);
  const signal = planning.actual.signal;
  const signalLabel = signal === "on_track" ? "План безубыточности выполнен" : signal === "attention" ? "Почти у цели" : "Нужны дополнительные продажи";
  const progressWidth = Math.max(4, Math.min(100, planning.actual.progress_percent));

  function updateService(id: string, patch: Partial<PricingService>) {
    setServices((current) => current.map((row) => row.service_type_id === id ? { ...row, ...patch } : row));
  }

  function updateAddon(id: string, patch: Partial<PricingAddon>) {
    setAddons((current) => current.map((row) => row.service_addon_id === id ? { ...row, ...patch } : row));
  }

  async function save(key: string, action: () => Promise<void>) {
    setNotices((current) => ({ ...current, [key]: { kind: "saving", message: "Сохраняем…" } }));
    try {
      await action();
      setNotices((current) => ({ ...current, [key]: { kind: "success", message: "Сохранено" } }));
    } catch (error) {
      setNotices((current) => ({ ...current, [key]: { kind: "error", message: error instanceof Error ? error.message : "Ошибка сохранения" } }));
    }
  }

  async function saveService(row: PricingService) {
    await save(`service:${row.service_type_id}`, async () => {
      await pricingRequest("PATCH", { entity: "service_type", id: row.service_type_id, patch: row });
    });
  }

  async function saveAddon(row: PricingAddon) {
    await save(`addon:${row.service_addon_id}`, async () => {
      await pricingRequest("PATCH", { entity: "service_addon", id: row.service_addon_id, patch: row });
    });
  }

  async function createService() {
    await save("new-service", async () => {
      const data = await pricingRequest("POST", { entity: "service_type", values: newService }) as PricingService;
      setServices((current) => [...current, { ...data, base_price: Number(data.base_price), min_price: Number(data.min_price), block_revenue_price: Number(data.block_revenue_price), material_cost_per_sqft: Number(data.material_cost_per_sqft), installation_cost_per_sqft: Number(data.installation_cost_per_sqft), block_cost_price: Number(data.block_cost_price) }]);
      setNewService({ name_ru: "", service_code: "", unit_type: "sqft", base_price: "", min_price: "" });
    });
  }

  async function createAddon() {
    await save("new-addon", async () => {
      const data = await pricingRequest("POST", { entity: "service_addon", values: newAddon }) as PricingAddon;
      setAddons((current) => [...current, { ...data, default_price: Number(data.default_price), min_price: Number(data.min_price), cost_price: Number(data.cost_price) }]);
      setNewAddon({ service_type_id: services[0]?.service_type_id ?? "", name_ru: "", addon_code: "", unit_type: "item", default_price: "", min_price: "" });
    });
  }

  async function savePlanning() {
    await save("planning", async () => {
      const data = await pricingRequest("PATCH", { entity: "planning", patch: planning.assumptions }) as PlanningSnapshot;
      setPlanning(data);
    });
  }

  return (
    <div className="workspace">
      <section className="surface">
        <div className="surface-head">
          <div>
            <h2 className="surface-title">План продаж и точка безубыточности</h2>
            <p className="surface-subtitle">Расчёт строится из общего overhead, средней маржи прайса, среднего чека и конверсии лидов.</p>
          </div>
          <span className={`chip ${signal === "on_track" ? "chip-success" : signal === "risk" ? "chip-danger" : "chip-accent"}`}>{signalLabel}</span>
        </div>
        <div className="metric-grid" style={{ marginTop: 16 }}>
          <div className="metric-cell"><div className="metric-label">Безубыточность</div><div className="metric-value">{money(planning.break_even.revenue)}</div><div className="metric-footnote">{planning.break_even.deals} сделок / {planning.break_even.leads} лидов</div></div>
          <div className="metric-cell"><div className="metric-label">Цель с прибылью</div><div className="metric-value">{money(planning.target.revenue)}</div><div className="metric-footnote">{planning.target.deals} сделок / {planning.target.leads} лидов</div></div>
          <div className="metric-cell"><div className="metric-label">КП за месяц</div><div className="metric-value">{money(planning.actual.proposal_revenue)}</div><div className="metric-footnote">{planning.actual.deals} сделок из {planning.actual.leads} лидов</div></div>
          <div className="metric-cell"><div className="metric-label">Прогресс</div><div className="metric-value">{planning.actual.progress_percent.toFixed(0)}%</div><div className="metric-footnote">до точки безубыточности по сумме КП</div></div>
        </div>
        <div className="signal-bar" style={{ marginTop: 16 }}><div className={`signal-bar-fill ${signal === "on_track" ? "signal-bar-fill-success" : signal === "risk" ? "signal-bar-fill-danger" : "signal-bar-fill-warning"}`} style={{ width: `${progressWidth}%` }} /></div>
        {canViewCosts ? (
          <div style={{ marginTop: 20 }}>
            <div style={fieldGridStyle}>
              <Field label="Средний чек, $" value={planning.assumptions.average_deal_value} onChange={(value) => setPlanning((current) => ({ ...current, assumptions: { ...current.assumptions, average_deal_value: Number(value) } }))} />
              <Field label="Конверсия лид → сделка, %" value={planning.assumptions.lead_to_deal_percent} onChange={(value) => setPlanning((current) => ({ ...current, assumptions: { ...current.assumptions, lead_to_deal_percent: Number(value) } }))} />
              <Field label="Целевая чистая прибыль / месяц, $" value={planning.assumptions.target_profit_monthly} onChange={(value) => setPlanning((current) => ({ ...current, assumptions: { ...current.assumptions, target_profit_monthly: Number(value) } }))} />
              <div><span className="row-meta">Общие расходы / месяц</span><div className="row-title" style={{ paddingTop: 10 }}>{money(planning.assumptions.monthly_overhead)}</div></div>
              <div><span className="row-meta">Средняя валовая маржа прайса</span><div className="row-title" style={{ paddingTop: 10 }}>{planning.assumptions.gross_margin_percent.toFixed(1)}%</div></div>
            </div>
            <div className="surface-actions" style={{ marginTop: 14 }}><button type="button" className="accent-button" onClick={savePlanning}>Пересчитать и сохранить план</button>{notices.planning ? <span className="row-meta">{notices.planning.message}</span> : null}</div>
          </div>
        ) : <p className="row-meta" style={{ marginTop: 16 }}>Менеджеру показан план по лидам и сделкам. Общие расходы и целевую прибыль меняет владелец.</p>}
      </section>

      <section className="surface">
        <div className="surface-head"><div><h2 className="surface-title">Услуги и цены для клиента</h2><p className="surface-subtitle">Единый прайс используется в калькуляторе и коммерческих предложениях.</p></div><span className="chip chip-accent">{activeServices.length} активных услуг</span></div>
        <details style={{ marginTop: 16 }}>
          <summary className="accent-button" style={{ display: "inline-flex", cursor: "pointer" }}>+ Добавить услугу</summary>
          <div className="surface" style={{ marginTop: 12, boxShadow: "none" }}>
            <div style={fieldGridStyle}>
              <Field type="text" label="Название услуги" value={newService.name_ru} onChange={(value) => setNewService((current) => ({ ...current, name_ru: value }))} />
              <Field type="text" label="Код (например SMART_FILM)" value={newService.service_code} onChange={(value) => setNewService((current) => ({ ...current, service_code: value }))} />
              <Field type="text" label="Единица (sqft, zone, item)" value={newService.unit_type} onChange={(value) => setNewService((current) => ({ ...current, unit_type: value }))} />
              <Field label="Цена клиенту, $" value={newService.base_price} onChange={(value) => setNewService((current) => ({ ...current, base_price: value }))} />
              <Field label="Минимальная цена, $" value={newService.min_price} onChange={(value) => setNewService((current) => ({ ...current, min_price: value }))} />
            </div>
            <div className="surface-actions" style={{ marginTop: 14 }}><button type="button" className="accent-button" onClick={createService} disabled={!newService.name_ru.trim()}>Создать услугу</button>{notices["new-service"] ? <span className="row-meta">{notices["new-service"].message}</span> : null}</div>
          </div>
        </details>
        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          {services.map((row) => {
            const cost = Number(row.material_cost_per_sqft || 0) + Number(row.installation_cost_per_sqft || 0);
            const margin = Number(row.base_price || 0) > 0 ? ((Number(row.base_price) - cost) / Number(row.base_price)) * 100 : 0;
            return <article key={row.service_type_id} className="analytics-panel">
              <div className="analytics-panel-head"><div><h3 className="surface-title">{row.name_ru}</h3><p className="surface-subtitle">{row.service_code} · за {row.unit_type}</p></div><label className="chip"><input type="checkbox" checked={row.is_active} onChange={(event) => updateService(row.service_type_id, { is_active: event.target.checked })} /> Активна</label></div>
              <div style={fieldGridStyle}>
                <Field type="text" label="Название" value={row.name_ru} onChange={(value) => updateService(row.service_type_id, { name_ru: value })} />
                <Field type="text" label="Единица" value={row.unit_type} onChange={(value) => updateService(row.service_type_id, { unit_type: value })} />
                <Field label="Цена клиенту, $" value={row.base_price} onChange={(value) => updateService(row.service_type_id, { base_price: value })} />
                <Field label="Минимальная цена, $" value={row.min_price} onChange={(value) => updateService(row.service_type_id, { min_price: value })} />
                <Field label="Блок питания клиенту, $" value={row.block_revenue_price} onChange={(value) => updateService(row.service_type_id, { block_revenue_price: value })} />
                {canViewCosts ? <><Field label="Материал / sqft, $" value={row.material_cost_per_sqft} onChange={(value) => updateService(row.service_type_id, { material_cost_per_sqft: value })} /><Field label="Монтажник / sqft, $" value={row.installation_cost_per_sqft} onChange={(value) => updateService(row.service_type_id, { installation_cost_per_sqft: value })} /><Field label="Себестоимость блока, $" value={row.block_cost_price} onChange={(value) => updateService(row.service_type_id, { block_cost_price: value })} /><div><span className="row-meta">Расчётная маржа</span><div className="row-title" style={{ paddingTop: 10 }}>{margin.toFixed(1)}%</div></div></> : null}
              </div>
              <div className="surface-actions" style={{ marginTop: 14 }}><button type="button" className="soft-button" onClick={() => saveService(row)}>Сохранить услугу</button>{notices[`service:${row.service_type_id}`] ? <span className="row-meta">{notices[`service:${row.service_type_id}`].message}</span> : null}</div>
            </article>;
          })}
        </div>
      </section>

      <section className="surface">
        <div className="surface-head"><div><h2 className="surface-title">Дополнительные работы</h2><p className="surface-subtitle">Подключение зон, силикон, демонтаж и другие допродажи.</p></div><span className="chip">{addons.length} позиций</span></div>
        <details style={{ marginTop: 16 }}><summary className="soft-button" style={{ display: "inline-flex", cursor: "pointer" }}>+ Добавить допработу</summary><div className="surface" style={{ marginTop: 12, boxShadow: "none" }}><div style={fieldGridStyle}><label><span className="row-meta">Основная услуга</span><select value={newAddon.service_type_id} onChange={(event) => setNewAddon((current) => ({ ...current, service_type_id: event.target.value }))}>{services.map((service) => <option key={service.service_type_id} value={service.service_type_id}>{service.name_ru}</option>)}</select></label><Field type="text" label="Название" value={newAddon.name_ru} onChange={(value) => setNewAddon((current) => ({ ...current, name_ru: value }))} /><Field type="text" label="Код" value={newAddon.addon_code} onChange={(value) => setNewAddon((current) => ({ ...current, addon_code: value }))} /><Field type="text" label="Единица" value={newAddon.unit_type} onChange={(value) => setNewAddon((current) => ({ ...current, unit_type: value }))} /><Field label="Цена клиенту, $" value={newAddon.default_price} onChange={(value) => setNewAddon((current) => ({ ...current, default_price: value }))} /><Field label="Минимальная цена, $" value={newAddon.min_price} onChange={(value) => setNewAddon((current) => ({ ...current, min_price: value }))} /></div><div className="surface-actions" style={{ marginTop: 14 }}><button type="button" className="accent-button" onClick={createAddon} disabled={!newAddon.name_ru.trim() || !newAddon.service_type_id}>Создать допработу</button>{notices["new-addon"] ? <span className="row-meta">{notices["new-addon"].message}</span> : null}</div></div></details>
        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>{addons.map((row) => <article key={row.service_addon_id} className="analytics-panel"><div className="analytics-panel-head"><div><h3 className="surface-title">{row.name_ru}</h3><p className="surface-subtitle">{services.find((service) => service.service_type_id === row.service_type_id)?.name_ru ?? "Услуга"} · {row.addon_code}</p></div><label className="chip"><input type="checkbox" checked={row.is_active} onChange={(event) => updateAddon(row.service_addon_id, { is_active: event.target.checked })} /> Активна</label></div><div style={fieldGridStyle}><Field type="text" label="Название" value={row.name_ru} onChange={(value) => updateAddon(row.service_addon_id, { name_ru: value })} /><Field type="text" label="Единица" value={row.unit_type} onChange={(value) => updateAddon(row.service_addon_id, { unit_type: value })} /><Field label="Цена клиенту, $" value={row.default_price} onChange={(value) => updateAddon(row.service_addon_id, { default_price: value })} /><Field label="Минимальная цена, $" value={row.min_price} onChange={(value) => updateAddon(row.service_addon_id, { min_price: value })} />{canViewCosts ? <Field label="Себестоимость, $" value={row.cost_price} onChange={(value) => updateAddon(row.service_addon_id, { cost_price: value })} /> : null}</div><div className="surface-actions" style={{ marginTop: 14 }}><button type="button" className="soft-button" onClick={() => saveAddon(row)}>Сохранить допработу</button>{notices[`addon:${row.service_addon_id}`] ? <span className="row-meta">{notices[`addon:${row.service_addon_id}`].message}</span> : null}</div></article>)}</div>
      </section>
    </div>
  );
}
