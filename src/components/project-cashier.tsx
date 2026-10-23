"use client";

/**
 * Касса проекта: менеджер тапает карточки, чек справа собирается сам.
 * Уровни: направления → тип плёнки → класс/бренд → плёнка со склада → размеры → услуги.
 * Расчёт делает сервер (/api/v1/projects/cashier/quote) той же функцией, что и создание проекта,
 * поэтому цифры на экране и в базе совпадают.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { CashierDirectionCode, CashierQuote, FilmClass } from "@/features/projects/cashier";
import { filmStockStatus, filterFilms, type CashierAddon, type CashierFilm } from "@/features/projects/cashier";
import { SASH_LAYOUT_OPTIONS } from "@/features/cutting/openings";

type DirectionMeta = {
  code: CashierDirectionCode;
  label_ru: string;
  color_token: string;
  service_type_id: string;
  film_types: Array<{ code: string; count: number }>;
  brands: Array<{ code: string; name_ru: string }>;
};

type AccessLevel = { access_code: string; name_ru: string; labor_coefficient: number; equipment_day_cost: number; is_contractor: boolean };

export type ProjectCashierProps = {
  directions: DirectionMeta[];
  films: CashierFilm[];
  addons: CashierAddon[];
  accessLevels: AccessLevel[];
  consultants: Array<{ user_id: string; full_name: string }>;
  installers: Array<{ user_id: string; full_name: string }>;
  initialClient?: { client_id?: string; client_name?: string; phone?: string; email?: string; service_address?: string };
  embedded?: boolean;
};

type DirectionState = {
  film_type_code: string | null;
  film_class: FilmClass;
  brand_code: string | null;
  film_id: string | null;
  price_per_sqft: number | null;
  addon_codes: string[];
  measurer_decides: boolean;
  query: string;
};

type OpeningState = {
  key: string;
  room_name: string;
  sash_layout_code: string;
  glass_finish_code: string;
  pane_structure_code: string;
  width_in: number;
  height_in: number;
  quantity: number;
  access_code: string;
  removal_required: boolean;
  direction_codes: CashierDirectionCode[];
};

const DIRECTION_COLORS: Record<string, { from: string; to: string; tint: string; ink: string; icon: string }> = {
  SOLAR_FILM: { from: "#FFA726", to: "#E65100", tint: "#FFF1E0", ink: "#B45309", icon: "☀" },
  SAFETY_FILM: { from: "#3D7BD8", to: "#1E40AF", tint: "#E8EFFD", ink: "#1E40AF", icon: "⛨" },
  SMART_FILM: { from: "#A855F7", to: "#6D28D9", tint: "#F3EBFF", ink: "#6D28D9", icon: "⚡" },
  DECORATIVE_FILM: { from: "#3CC2B5", to: "#128A80", tint: "#E3F7F5", ink: "#0F766E", icon: "◆" },
  PRIVACY_FILM: { from: "#EC4899", to: "#BE185D", tint: "#FDE7F1", ink: "#BE185D", icon: "◐" },
};

const ADDON_COLORS: Record<string, { from: string; to: string; tint: string; ink: string }> = {
  "addon-silicone": { from: "#38BDF8", to: "#0284C7", tint: "#DCF0FB", ink: "#0369A1" },
  "addon-removal": { from: "#F87171", to: "#DC2626", tint: "#FDECEC", ink: "#B91C1C" },
  "addon-height": { from: "#A855F7", to: "#6D28D9", tint: "#EDE4FF", ink: "#6D28D9" },
  "addon-cleaning": { from: "#D6A06A", to: "#92400E", tint: "#F6EBDD", ink: "#92400E" },
  "addon-anchoring": { from: "#2DD4BF", to: "#0F766E", tint: "#E3F6F2", ink: "#0F766E" },
  "addon-electrical": { from: "#94A3B8", to: "#475569", tint: "#E2E8F0", ink: "#334155" },
  "addon-equipment": { from: "#3A5068", to: "#1D2B3C", tint: "#E6EAF0", ink: "#1D2B3C" },
};

const FILM_TYPE_LABELS: Record<string, string> = {
  ceramic: "Керамическая", metal: "Металлизированная", a1: "A1 · 8 mil", a2: "A2 · 12–14 mil", a3: "A3 · 24 mil", anti_graffiti: "Антиграфити",
  pdlc_self: "Самоклеящаяся", pdlc_laminated: "Ламинированная", pdlc_decorative: "С рисунком", frost: "Матовая", pattern: "С узором", one_way: "Односторонняя",
};

const GLASS_FINISH = [["clear", "Прозрачное"], ["tinted", "Тонированное"], ["low_e", "Low-E"], ["reflective", "Зеркальное"], ["tempered", "Закалённое"], ["laminated", "Ламинированное"]] as const;
const PANE_STRUCTURE = [["single", "Одинарное"], ["dual", "Двойной (IGU)"], ["triple", "Тройной"]] as const;

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

function colorFor(code: string) {
  return DIRECTION_COLORS[code] ?? { from: "#8A90A8", to: "#475569", tint: "#EEF1F5", ink: "#334155", icon: "•" };
}

function addonColor(token: string | null, direction: CashierDirectionCode) {
  return (token && ADDON_COLORS[token]) || (token?.startsWith("dir-") ? colorFor(direction) : colorFor(direction));
}

function tileStyle(on: boolean, palette: { from: string; to: string; tint: string; ink: string }, dashed = false): React.CSSProperties {
  return on
    ? { background: `linear-gradient(135deg, ${palette.from}, ${palette.to})`, color: "#fff", borderColor: "transparent", boxShadow: `0 14px 26px -14px ${palette.to}` }
    : { background: palette.tint, color: palette.ink, borderColor: dashed ? palette.ink : "transparent", borderStyle: dashed ? "dashed" : "solid" };
}

function defaultDirectionState(meta: DirectionMeta): DirectionState {
  return { film_type_code: meta.film_types[0]?.code ?? null, film_class: "standard", brand_code: meta.brands[0]?.code ?? null, film_id: null, price_per_sqft: null, addon_codes: [], measurer_decides: false, query: "" };
}

export function ProjectCashier(props: ProjectCashierProps) {
  const [selected, setSelected] = useState<CashierDirectionCode[]>([]);
  const [current, setCurrent] = useState<CashierDirectionCode | null>(null);
  const [cfg, setCfg] = useState<Partial<Record<CashierDirectionCode, DirectionState>>>({});
  const [openings, setOpenings] = useState<OpeningState[]>([]);
  const [client, setClient] = useState({ client_id: props.initialClient?.client_id ?? "", client_name: props.initialClient?.client_name ?? "", phone: props.initialClient?.phone ?? "", email: props.initialClient?.email ?? "", service_address: props.initialClient?.service_address ?? "", site_type: "RESIDENTIAL" as "RESIDENTIAL" | "COMMERCIAL" });
  const [consultantId, setConsultantId] = useState("");
  const [installerId, setInstallerId] = useState("");
  const [quote, setQuote] = useState<CashierQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ project_code: string | null; title: string; total: number } | null>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const payload = useMemo(
    () => ({
      directions: selected.map((code) => {
        const state = cfg[code] ?? defaultDirectionState(props.directions.find((d) => d.code === code)!);
        return { direction_code: code, film_type_code: state.film_type_code, film_class: state.film_class, brand_code: state.brand_code, film_id: state.film_id, price_per_sqft: state.price_per_sqft, addon_codes: state.addon_codes, measurer_decides: state.measurer_decides };
      }),
      openings: openings.map((opening) => ({ ...opening, room_name: opening.room_name || null, direction_codes: opening.direction_codes.filter((code) => selected.includes(code)) })),
    }),
    [selected, cfg, openings, props.directions],
  );

  // Чек пересчитывает сервер — той же функцией, что создаёт проект.
  useEffect(() => {
    if (selected.length === 0) { setQuote(null); return; }
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(async () => {
      const response = await fetch("/api/v1/projects/cashier/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = (await response.json().catch(() => null)) as { data?: CashierQuote } | null;
      if (json?.data) setQuote(json.data);
    }, 180);
  }, [payload, selected.length]);

  const meta = current ? props.directions.find((d) => d.code === current) ?? null : null;
  const state = meta ? cfg[meta.code] ?? defaultDirectionState(meta) : null;
  const update = (code: CashierDirectionCode, patch: Partial<DirectionState>) =>
    setCfg((prev) => ({ ...prev, [code]: { ...(prev[code] ?? defaultDirectionState(props.directions.find((d) => d.code === code)!)), ...patch } }));

  const toggleDirection = (code: CashierDirectionCode) => {
    if (selected.includes(code)) {
      const next = selected.filter((item) => item !== code);
      setSelected(next);
      setCurrent(next.includes(current as CashierDirectionCode) ? current : next[0] ?? null);
    } else {
      setSelected([...selected, code]);
      setCurrent(code);
      if (!cfg[code]) update(code, {});
      if (openings.length === 0) addOpening(code);
    }
  };

  const addOpening = (direction?: CashierDirectionCode, quantity = 1) =>
    setOpenings((prev) => [
      ...prev,
      { key: `O${prev.length + 1}`, room_name: "", sash_layout_code: "single", glass_finish_code: "clear", pane_structure_code: "dual", width_in: 36, height_in: 48, quantity, access_code: "floor", removal_required: false, direction_codes: [direction ?? selected[0]].filter(Boolean) as CashierDirectionCode[] },
    ]);
  const patchOpening = (index: number, patch: Partial<OpeningState>) => setOpenings((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const filmList = meta && state ? filterFilms(props.films, { direction_code: meta.code, film_type_code: state.film_type_code, film_class: state.film_class, brand_code: state.brand_code, query: state.query }) : [];
  const directionAddons = meta ? props.addons.filter((addon) => addon.direction_code === meta.code) : [];
  const belowMinimum = quote?.errors.some((e) => e.startsWith("below_minimum")) ?? false;

  const submit = async () => {
    if (!quote || belowMinimum || busy) return;
    if (!client.client_id && !client.client_name.trim()) { setError("Укажи клиента."); return; }
    setBusy(true); setError(null);
    const response = await fetch("/api/v1/projects/cashier", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, client_id: client.client_id || null, client_name: client.client_name, phone: client.phone || null, email: client.email || null, service_address: client.service_address || null, site_type: client.site_type, consultant_user_id: consultantId || null, installer_id: installerId || null }),
    });
    const json = (await response.json().catch(() => null)) as { data?: { project_code: string | null; title: string; quote: CashierQuote }; errors?: Array<{ code?: string; message?: string }> } | null;
    setBusy(false);
    if (!response.ok || !json?.data) { setError(json?.errors?.[0]?.message ?? `Не удалось создать проект (${response.status}).`); return; }
    setCreated({ project_code: json.data.project_code, title: json.data.title, total: json.data.quote.total });
  };

  if (created) {
    return (
      <section className="cashier-done surface">
        <div className="page-kicker">Проект создан</div>
        <h2 className="detail-heading">{created.title}</h2>
        <p className="detail-meta">{created.project_code} · итого {money(created.total)}. Позиции по направлениям, услуги и окна записаны; замер, КП и наряд читают их из одного места.</p>
        <div className="cashier-actions">
          <a className="btn-primary" href="/legacy-crm">К заказам</a>
          <button type="button" className="soft-button" onClick={() => { setCreated(null); setSelected([]); setCurrent(null); setCfg({}); setOpenings([]); setQuote(null); }}>Ещё проект</button>
        </div>
      </section>
    );
  }

  return (
    <div className="cashier">
      <div className="cashier-main">
        <section className="cashier-block">
          <header className="cashier-head"><span className="cashier-step">1 · Направления</span><span className="cashier-hint">тап — добавить в проект, можно несколько; первое — основное</span></header>
          <div className="cashier-grid cashier-grid-5">
            {props.directions.map((direction) => {
              const on = selected.includes(direction.code);
              const palette = colorFor(direction.code);
              return (
                <button key={direction.code} type="button" className={`cashier-tile${on ? " on" : ""}`} style={tileStyle(on, palette)} aria-pressed={on} onClick={() => toggleDirection(direction.code)}>
                  <span className="cashier-tile-top"><span className="cashier-tile-icon" style={{ background: on ? "rgba(255,255,255,.22)" : palette.to, color: "#fff" }}>{palette.icon}</span>{on ? <span className="cashier-badge">{selected[0] === direction.code ? "основное" : "в проекте"}</span> : null}</span>
                  <b>{direction.label_ru}</b>
                </button>
              );
            })}
          </div>
        </section>

        {meta && state ? (
          <section className="cashier-block cashier-panel" style={{ borderLeftColor: colorFor(meta.code).to }}>
            <div className="cashier-tabs">
              {selected.map((code) => {
                const d = props.directions.find((item) => item.code === code)!; const s = cfg[code]; const film = props.films.find((f) => f.film_id === s?.film_id);
                const palette = colorFor(code);
                return (
                  <button key={code} type="button" className="cashier-tab" style={code === meta.code ? { background: palette.tint, borderColor: palette.to, color: palette.ink } : undefined} onClick={() => setCurrent(code)}>
                    <span className="cashier-dot" style={{ background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` }} />{d.label_ru}<span className="cashier-muted">{film ? ` · ${film.model_name}` : s?.measurer_decides ? " · замер" : " · плёнка?"}</span>
                  </button>
                );
              })}
            </div>

            <header className="cashier-head"><span className="cashier-step">2 · Тип плёнки — {meta.label_ru}</span><span className="cashier-hint">можно пропустить: определит замерщик</span></header>
            <div className="cashier-grid cashier-grid-4">
              {meta.film_types.map((type) => (
                <button key={type.code} type="button" className={`cashier-tile${state.film_type_code === type.code && !state.measurer_decides ? " on" : ""}`} style={tileStyle(state.film_type_code === type.code && !state.measurer_decides, colorFor(meta.code))} onClick={() => update(meta.code, { film_type_code: type.code, film_id: null, price_per_sqft: null, measurer_decides: false })}>
                  <b>{FILM_TYPE_LABELS[type.code] ?? type.code}</b><small>{type.count} моделей</small>
                </button>
              ))}
              <button type="button" className={`cashier-tile${state.measurer_decides ? " on" : ""}`} style={state.measurer_decides ? tileStyle(true, { from: "#F5C04A", to: "#C28A12", tint: "#FFF6DF", ink: "#9A6A0A" }) : { background: "#fff", color: "#5B6380", borderColor: "#D9DEE6" }} onClick={() => update(meta.code, { measurer_decides: !state.measurer_decides, film_id: null, price_per_sqft: null })}>
                <b>Определит замерщик</b><small>плёнка и размеры с объекта</small>
              </button>
            </div>

            {!state.measurer_decides ? (
              <>
                <header className="cashier-head"><span className="cashier-step">3 · Класс и модель</span><span className="cashier-hint">список со склада · коридор мин–макс из справочника</span></header>
                <div className="cashier-row">
                  {(["standard", "premium"] as FilmClass[]).map((cls) => (
                    <button key={cls} type="button" className={`cashier-tile cashier-tile-sm${state.film_class === cls ? " on" : ""}`} style={tileStyle(state.film_class === cls, colorFor(meta.code))} onClick={() => update(meta.code, { film_class: cls, film_id: null, price_per_sqft: null })}>
                      <b>{cls === "standard" ? "Стандарт" : "Премиум"}</b><small>{cls === "standard" ? "своя линейка" : "брендовая"}</small>
                    </button>
                  ))}
                  {state.film_class === "premium" ? meta.brands.map((brand) => (
                    <button key={brand.code} type="button" className={`cashier-tile cashier-tile-sm${state.brand_code === brand.code ? " on" : ""}`} style={tileStyle(state.brand_code === brand.code, { from: "#F5C04A", to: "#C28A12", tint: "#FFF6DF", ink: "#9A6A0A" })} onClick={() => update(meta.code, { brand_code: brand.code, film_id: null, price_per_sqft: null })}>
                      <b>{brand.name_ru}</b>
                    </button>
                  )) : null}
                </div>
                <div className="cashier-list">
                  <div className="cashier-search"><span>⌕</span><input value={state.query} onChange={(event) => update(meta.code, { query: event.target.value })} placeholder="Поиск: модель, VLT, бренд… например «35» или «керам»" /><span className="cashier-muted">{filmList.length} шт</span></div>
                  <div className="cashier-list-body">
                    {filmList.map((film) => {
                      const on = state.film_id === film.film_id; const stock = filmStockStatus(film);
                      const dot = stock === "out" ? "#DC2626" : stock === "low" ? "#CA8A04" : stock === "ok" ? "#16A34A" : "#94A3B8";
                      return (
                        <button key={film.film_id} type="button" className={`cashier-film${on ? " on" : ""}`} style={on ? { background: `linear-gradient(135deg, ${colorFor(meta.code).from}, ${colorFor(meta.code).to})`, color: "#fff" } : undefined} onClick={() => update(meta.code, { film_id: film.film_id, price_per_sqft: film.price_per_sqft })}>
                          <span className="cashier-dot" style={{ background: dot }} />
                          <span className="cashier-film-name"><b>{film.model_name}</b><small>{[FILM_TYPE_LABELS[film.film_type_code ?? ""] ?? film.film_type_code, film.vlt_percent != null ? `VLT ${film.vlt_percent}%` : null].filter(Boolean).join(" · ")}</small></span>
                          <span className="cashier-film-stock" style={on ? undefined : { color: dot }}>{stock === "out" ? "нет · под заказ" : stock === "low" ? `${film.stock_sqft} sq ft · мало` : stock === "ok" ? `${film.stock_sqft} sq ft` : "остаток: склад"}</span>
                          <span className="cashier-film-price">{film.min_price_per_sqft != null && film.max_price_per_sqft != null ? `$${film.min_price_per_sqft}–${film.max_price_per_sqft} / sq ft` : film.price_per_sqft != null ? `$${film.price_per_sqft} / sq ft` : "цена не задана"}</span>
                        </button>
                      );
                    })}
                    {filmList.length === 0 ? <div className="cashier-empty">Ничего не нашлось — поищи иначе или добавь плёнку в каталог</div> : null}
                  </div>
                </div>
              </>
            ) : null}

            <header className="cashier-head"><span className="cashier-step">5 · Услуги направления</span><span className="cashier-hint">у услуги свой цвет во всей CRM · пунктир — подсказка, добавляет менеджер · высотные считаются из «доступа»</span></header>
            <div className="cashier-grid cashier-grid-4">
              {directionAddons.map((addon) => {
                const on = state.addon_codes.includes(addon.addon_code);
                const suggested = !on && (quote?.groups.find((g) => g.direction_code === meta.code)?.suggested_addon_codes.includes(addon.addon_code) ?? false);
                return (
                  <button key={addon.service_addon_id} type="button" className={`cashier-tile cashier-tile-sm${on ? " on" : ""}`} style={tileStyle(on, addonColor(addon.color_token, meta.code), suggested)} onClick={() => update(meta.code, { addon_codes: on ? state.addon_codes.filter((c) => c !== addon.addon_code) : [...state.addon_codes, addon.addon_code] })}>
                    <b>{addon.name_ru}</b><small>{addon.unit_type === "sqft" ? `$${addon.default_price} / sq ft` : addon.unit_type === "lft" ? `$${addon.default_price} / пог. фут` : addon.unit_type === "qty" ? `$${addon.default_price} / шт` : `$${addon.default_price}`}</small>
                    {suggested ? <span className="cashier-badge cashier-badge-light">обычно нужно</span> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {selected.length > 0 ? (
          <section className="cashier-block cashier-table-block">
            <header className="cashier-head"><span className="cashier-step">4 · Размеры — общие для проекта</span><span className="cashier-hint">дюймы · у окна отмечаешь направления · «снять старую» уходит в услугу с ценой из прайса</span><span className="cashier-sum">{quote ? `${quote.openings_count} проёмов · ${quote.glass_sqft} sq ft стекла · по раскрою ${quote.film_sqft} sq ft` : ""}</span></header>
            <div className="cashier-table-wrap">
              <table className="cashier-table">
                <thead><tr><th>Комната</th><th>Проём</th><th>Стекло</th><th>Пакет</th><th>Ш</th><th>В</th><th>Кол-во</th><th>Доступ</th><th>Направления</th><th>Снять старую</th><th /></tr></thead>
                <tbody>
                  {openings.map((opening, index) => (
                    <tr key={opening.key}>
                      <td><input value={opening.room_name} placeholder="Гостиная" onChange={(e) => patchOpening(index, { room_name: e.target.value })} /></td>
                      <td><select value={opening.sash_layout_code} onChange={(e) => patchOpening(index, { sash_layout_code: e.target.value })}>{SASH_LAYOUT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label_ru}</option>)}</select></td>
                      <td><select value={opening.glass_finish_code} onChange={(e) => patchOpening(index, { glass_finish_code: e.target.value })}>{GLASS_FINISH.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                      <td><select value={opening.pane_structure_code} onChange={(e) => patchOpening(index, { pane_structure_code: e.target.value })}>{PANE_STRUCTURE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                      <td><input type="number" min={1} value={opening.width_in} onChange={(e) => patchOpening(index, { width_in: Number(e.target.value) })} /></td>
                      <td><input type="number" min={1} value={opening.height_in} onChange={(e) => patchOpening(index, { height_in: Number(e.target.value) })} /></td>
                      <td><input type="number" min={1} value={opening.quantity} onChange={(e) => patchOpening(index, { quantity: Math.max(1, Math.floor(Number(e.target.value))) })} /></td>
                      <td><select value={opening.access_code} style={opening.access_code !== "floor" ? { color: "#6D28D9", borderColor: "#6D28D9", background: "#F3EBFF" } : undefined} onChange={(e) => patchOpening(index, { access_code: e.target.value })}>{props.accessLevels.map((a) => <option key={a.access_code} value={a.access_code}>{a.name_ru}{a.labor_coefficient > 1 ? ` ×${a.labor_coefficient}` : ""}</option>)}</select></td>
                      <td><span className="cashier-dirchips">{selected.map((code) => { const on = opening.direction_codes.includes(code); const palette = colorFor(code); return <button key={code} type="button" className="cashier-dirchip" title={props.directions.find((d) => d.code === code)?.label_ru} style={on ? { background: `linear-gradient(135deg, ${palette.from}, ${palette.to})`, color: "#fff", borderColor: "transparent" } : undefined} aria-pressed={on} onClick={() => patchOpening(index, { direction_codes: on ? opening.direction_codes.filter((c) => c !== code) : [...opening.direction_codes, code] })}>{palette.icon}</button>; })}</span></td>
                      <td className="cashier-center"><input type="checkbox" checked={opening.removal_required} onChange={(e) => patchOpening(index, { removal_required: e.target.checked })} /></td>
                      <td><button type="button" className="cashier-x" aria-label="Удалить проём" onClick={() => setOpenings((prev) => prev.filter((_, i) => i !== index))}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cashier-table-foot">
              <button type="button" className="soft-button" onClick={() => addOpening()}>+ Проём</button>
              <button type="button" className="soft-button" onClick={() => addOpening(undefined, 5)}>+ 5 одинаковых</button>
              <span className="cashier-hint">Замерщик дополнит окна на объекте из своего кабинета — те же записи.</span>
            </div>
          </section>
        ) : null}

        {selected.length > 0 ? (
          <section className="cashier-block">
            <header className="cashier-head"><span className="cashier-step">Клиент и объект</span></header>
            <div className="cashier-client">
              <label><span>Клиент</span><input value={client.client_name} onChange={(e) => setClient({ ...client, client_name: e.target.value })} placeholder="Имя или компания" /></label>
              <label><span>Телефон</span><input value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} placeholder="(323) 555-0148" /></label>
              <label><span>Email</span><input value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} placeholder="client@example.com" /></label>
              <label><span>Адрес объекта</span><input value={client.service_address} onChange={(e) => setClient({ ...client, service_address: e.target.value })} placeholder="1420 N Sierra Bonita Ave, Pasadena" /></label>
              <label><span>Объект</span><select value={client.site_type} onChange={(e) => setClient({ ...client, site_type: e.target.value as "RESIDENTIAL" | "COMMERCIAL" })}><option value="RESIDENTIAL">Жилой</option><option value="COMMERCIAL">Коммерческий</option></select></label>
              <label><span>Замерщик</span><select value={consultantId} onChange={(e) => setConsultantId(e.target.value)}><option value="">— размеры от клиента</option>{props.consultants.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}</select></label>
              <label><span>Монтажник</span><select value={installerId} onChange={(e) => setInstallerId(e.target.value)}><option value="">— назначить позже</option>{props.installers.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}</select></label>
            </div>
          </section>
        ) : null}
      </div>

      <aside className="cashier-check surface">
        <header className="cashier-check-head"><b>Состав проекта</b><span className="chip">Черновик</span></header>
        {!quote ? <div className="cashier-empty">Тапни направление — проект начнёт собираться здесь</div> : null}
        {quote?.groups.map((group) => {
          const palette = group.direction_code === "SITE" ? { from: "#8A90A8", to: "#475569", tint: "#F1F3F8", ink: "#334155" } : colorFor(group.direction_code);
          const dirState = group.direction_code !== "SITE" ? cfg[group.direction_code] : undefined;
          return (
            <div key={group.direction_code} className="cashier-group">
              <div className="cashier-group-head" style={{ background: palette.tint }}><span className="cashier-dot" style={{ background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` }} /><b>{group.label_ru.toUpperCase()}</b><span className="cashier-muted">{group.direction_code !== "SITE" ? `${group.openings_count} окон · ${group.glass_sqft} sq ft` : "не зависит от направления"}</span><b className="cashier-right">{money(group.amount)}</b></div>
              {group.lines.map((line) => {
                const lineColor = line.color_token && ADDON_COLORS[line.color_token] ? ADDON_COLORS[line.color_token] : palette;
                return (
                  <div key={`${group.direction_code}:${line.code}`} className="cashier-line">
                    <span className="cashier-bar" style={{ background: `linear-gradient(135deg, ${lineColor.from}, ${lineColor.to})` }} />
                    <div className="cashier-line-body">
                      <b>{line.title_ru}</b><small>{line.detail_ru}</small>
                      {line.kind === "film" && group.film && dirState && !group.measurer_decides ? (
                        <div className="cashier-price">
                          <span>{line.quantity} sq ft ×</span>
                          <span className={`cashier-price-box${line.below_minimum ? " bad" : ""}`}>$<input type="number" step="0.5" value={dirState.price_per_sqft ?? group.film.price_per_sqft ?? 0} onChange={(e) => update(group.direction_code as CashierDirectionCode, { price_per_sqft: Number(e.target.value) })} aria-label="Цена за sq ft" /></span>
                          <small className={line.below_minimum ? "bad" : ""}>{line.below_minimum ? `ниже минимума $${group.film.min_price_per_sqft} — продать нельзя` : group.film.min_price_per_sqft != null ? `коридор $${group.film.min_price_per_sqft}–${group.film.max_price_per_sqft ?? "…"}` : "коридор не задан"}</small>
                        </div>
                      ) : null}
                    </div>
                    <b className="cashier-right">{line.kind === "contractor" ? "$ —" : money(line.amount)}</b>
                  </div>
                );
              })}
              {group.suggested_addon_codes.map((code) => {
                const addon = props.addons.find((a) => a.direction_code === group.direction_code && a.addon_code === code);
                if (!addon || !dirState) return null;
                return (
                  <button key={code} type="button" className="cashier-suggest" onClick={() => update(group.direction_code as CashierDirectionCode, { addon_codes: [...dirState.addon_codes, code] })}>
                    <span>+ {addon.name_ru} · обычно идёт вместе</span><small>ДОБАВИТЬ</small>
                  </button>
                );
              })}
            </div>
          );
        })}
        <footer className="cashier-check-foot">
          <div className="cashier-total"><span className="cashier-step">Итого</span><b>{quote ? money(quote.total) : "$0"}</b></div>
          <div className="cashier-foot-meta"><span>{quote ? `${quote.openings_count} проёмов · ${quote.glass_sqft} sq ft` : ""}</span><span>{quote && quote.min_total ? `минимум проекта ${money(quote.min_total)}` : ""}</span></div>
          {quote?.warnings.length ? <div className="cashier-warn">{quote.warnings.map((w) => w.startsWith("stock_out") ? "плёнки нет на складе — под заказ" : w.startsWith("stock_low") ? "плёнки на складе мало" : w.startsWith("cutting_seam") ? "есть стекло шире рулона — стык" : w === "contractor_quote_required" ? "нужна смета подрядчика" : w.startsWith("film_missing") ? "выбери модель плёнки" : null).filter(Boolean).join(" · ")}</div> : null}
          {error ? <div className="cashier-warn bad">{error}</div> : null}
          <div className="cashier-actions">
            <button type="button" className="btn-primary" disabled={!quote || belowMinimum || busy} onClick={submit}>{busy ? "Сохраняю…" : "Создать проект"}</button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
