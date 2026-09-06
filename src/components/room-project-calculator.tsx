"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  calculateLineEconomics,
  calculateLineTotal,
  createCardForServiceType,
  getAllowedFilmCategoryCodes,
  getServiceTypeById,
} from "@/features/calculator/logic";
import type { CalculatorBootstrap, CalculatorCard } from "@/features/calculator/types";

type DealLike = any | null;

type RoomOpening = {
  id: string;
  name: string;
  widthIn: number | null;
  heightIn: number | null;
  quantity: number;
  card: CalculatorCard;
};

type RoomGroup = {
  id: string;
  name: string;
  openings: RoomOpening[];
};

type ProjectExpense = {
  id: string;
  label: string;
  amount: number;
};

type Props = {
  bootstrap: CalculatorBootstrap;
  deal?: DealLike;
  showInternalEconomics?: boolean;
  recommendedFixedCost?: number;
  monthlyOverhead?: number;
};

const FILM_CODES = new Set(["SMART_FILM", "SOLAR_FILM", "SAFETY_FILM"]);
let sequence = 0;

function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function round(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function sqftFromOpening(opening: RoomOpening) {
  const width = Number(opening.widthIn) || 0;
  const height = Number(opening.heightIn) || 0;
  const quantity = Math.max(1, Number(opening.quantity) || 1);
  return round((width * height * quantity) / 144);
}

function makeOpening(bootstrap: CalculatorBootstrap, index = 1): RoomOpening {
  const serviceType = bootstrap.service_types.find((item) => FILM_CODES.has(item.service_code)) ?? bootstrap.service_types[0] ?? null;
  return {
    id: nextId("opening"),
    name: `Окно ${index}`,
    widthIn: null,
    heightIn: null,
    quantity: 1,
    card: createCardForServiceType(bootstrap, serviceType?.service_type_id ?? null),
  };
}

function makeRoom(bootstrap: CalculatorBootstrap, index = 1): RoomGroup {
  return {
    id: nextId("room"),
    name: `Комната ${index}`,
    openings: [makeOpening(bootstrap, 1)],
  };
}

function flattenCards(rooms: RoomGroup[]) {
  return rooms.flatMap((room) =>
    room.openings.map((opening) => {
      const sqft = sqftFromOpening(opening);
      return {
        ...opening.card,
        dynamic_fields: {
          ...opening.card.dynamic_fields,
          room_name: room.name.trim() || "Без комнаты",
          window_id: opening.name.trim() || opening.id,
          width_in: opening.widthIn ?? null,
          height_in: opening.heightIn ?? null,
          windows_qty: Math.max(1, Number(opening.quantity) || 1),
          sqft,
          actual_film_sqft: sqft,
        },
      } satisfies CalculatorCard;
    }),
  );
}

async function parseEnvelope(response: Response) {
  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message ?? "Не удалось сохранить расчет.");
  }
  return payload.data;
}

export function RoomProjectCalculator({
  bootstrap,
  deal = null,
  showInternalEconomics = false,
  recommendedFixedCost = 0,
  monthlyOverhead = 0,
}: Props) {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomGroup[]>([makeRoom(bootstrap, 1)]);
  const [fixedCost, setFixedCost] = useState(round(recommendedFixedCost));
  const [variableExpenses, setVariableExpenses] = useState<ProjectExpense[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const cards = useMemo(() => flattenCards(rooms), [rooms]);
  const lineResults = useMemo(
    () => cards.map((card) => ({ card, line: calculateLineTotal(card, bootstrap), economics: calculateLineEconomics(card, bootstrap) })),
    [cards, bootstrap],
  );

  const quotedTotal = round(lineResults.reduce((sum, item) => sum + item.line.line_total, 0));
  const materialCost = round(lineResults.reduce((sum, item) => sum + item.economics.material_cost_total, 0));
  const installationCost = round(lineResults.reduce((sum, item) => sum + item.economics.installation_cost_total, 0));
  const blockCost = round(lineResults.reduce((sum, item) => sum + item.economics.block_cost_total, 0));
  const addonCost = round(lineResults.reduce((sum, item) => sum + item.economics.addon_cost_total, 0));
  const variableCost = round(variableExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
  const directCost = round(materialCost + installationCost + blockCost + addonCost + variableCost);
  const fullCost = round(directCost + (showInternalEconomics ? fixedCost : 0));
  const profit = round(quotedTotal - fullCost);
  const margin = quotedTotal > 0 ? round((profit / quotedTotal) * 100) : 0;
  const totalSqft = round(cards.reduce((sum, card) => sum + Number(card.dynamic_fields.sqft || 0), 0));

  function updateRoom(roomId: string, updater: (room: RoomGroup) => RoomGroup) {
    setRooms((current) => current.map((room) => (room.id === roomId ? updater(room) : room)));
  }

  function updateOpening(roomId: string, openingId: string, updater: (opening: RoomOpening) => RoomOpening) {
    updateRoom(roomId, (room) => ({
      ...room,
      openings: room.openings.map((opening) => (opening.id === openingId ? updater(opening) : opening)),
    }));
  }

  function addRoom() {
    setRooms((current) => [...current, makeRoom(bootstrap, current.length + 1)]);
  }

  function addOpening(roomId: string) {
    updateRoom(roomId, (room) => ({
      ...room,
      openings: [...room.openings, makeOpening(bootstrap, room.openings.length + 1)],
    }));
  }

  function removeRoom(roomId: string) {
    setRooms((current) => (current.length > 1 ? current.filter((room) => room.id !== roomId) : current));
  }

  function removeOpening(roomId: string, openingId: string) {
    updateRoom(roomId, (room) => ({
      ...room,
      openings: room.openings.length > 1 ? room.openings.filter((opening) => opening.id !== openingId) : room.openings,
    }));
  }

  function applyFilmToRoom(roomId: string, sourceOpening: RoomOpening) {
    if (!sourceOpening.card.film_id) return;
    updateRoom(roomId, (room) => ({
      ...room,
      openings: room.openings.map((opening) => ({
        ...opening,
        card: {
          ...opening.card,
          service_type_id: sourceOpening.card.service_type_id,
          selected_category_code: sourceOpening.card.selected_category_code,
          selected_brand_code: sourceOpening.card.selected_brand_code,
          film_id: sourceOpening.card.film_id,
          pricing: { ...sourceOpening.card.pricing },
        },
      })),
    }));
  }

  function validate() {
    for (const room of rooms) {
      if (!room.name.trim()) return "У каждой комнаты должно быть название.";
      for (const opening of room.openings) {
        const service = getServiceTypeById(bootstrap.service_types, opening.card.service_type_id);
        if (!service) return `Выберите услугу для ${room.name} / ${opening.name}.`;
        if (!opening.widthIn || !opening.heightIn) return `Введите ширину и высоту: ${room.name} / ${opening.name}.`;
        if (FILM_CODES.has(service.service_code) && !opening.card.film_id) {
          return `Выберите пленку: ${room.name} / ${opening.name}.`;
        }
      }
    }
    return null;
  }

  async function saveProposal() {
    const validationError = validate();
    if (validationError) {
      setMessage(validationError);
      return;
    }
    if (!deal?.deal_id) {
      setMessage("Расчет готов. Чтобы сохранить его в КП, откройте калькулятор из карточки сделки.");
      return;
    }

    setSaving(true);
    setMessage("Сохраняю КП…");
    try {
      const payloadCards = flattenCards(rooms).map((card, index) => ({
        ...card,
        // Internal owner economics never becomes a client line. The values are
        // intentionally not persisted in calculator_cards; project finance is
        // recalculated server-side from canonical pricing/cost settings.
        dynamic_fields: {
          ...card.dynamic_fields,
          ...(index === 0 ? { calculator_total_sqft: totalSqft } : {}),
        },
      }));

      const data = await parseEnvelope(
        await fetch("/api/v1/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_id: deal.deal_id, calculator_cards: payloadCards }),
        }),
      );
      setMessage("КП создано. Открываю документ.");
      router.push(`/manager/crm/proposals/${data.proposal.proposal_id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить КП.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="surface" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div className="page-kicker">БЫСТРЫЙ РАСЧЕТ</div>
            <h2 className="detail-heading" style={{ margin: "4px 0" }}>Комнаты → окна → пленка → цена</h2>
            <div className="detail-meta">
              <span>Размеры в дюймах, площадь считается автоматически.</span>
              <span>Для каждого окна/зоны пленка обязательна.</span>
            </div>
          </div>
          <button type="button" className="accent-button" onClick={addRoom}>+ Комната</button>
        </div>
      </section>

      {rooms.map((room, roomIndex) => (
        <section key={room.id} className="surface" style={{ padding: 18 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 320px" }}>
              <strong>{roomIndex + 1}.</strong>
              <input
                value={room.name}
                onChange={(event) => updateRoom(room.id, (current) => ({ ...current, name: event.target.value }))}
                aria-label={`Название комнаты ${roomIndex + 1}`}
                style={{ width: "100%", minHeight: 42 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="soft-button" onClick={() => addOpening(room.id)}>+ Окно / зона</button>
              <button type="button" className="soft-button" onClick={() => removeRoom(room.id)} disabled={rooms.length === 1}>Удалить</button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {room.openings.map((opening, openingIndex) => {
              const service = getServiceTypeById(bootstrap.service_types, opening.card.service_type_id);
              const allowedCategories = getAllowedFilmCategoryCodes(service?.service_code ?? null);
              const films = bootstrap.film_catalog.filter((film) => allowedCategories.includes(film.category_code));
              const sqft = sqftFromOpening(opening);
              const cardWithArea: CalculatorCard = {
                ...opening.card,
                dynamic_fields: { ...opening.card.dynamic_fields, sqft, actual_film_sqft: sqft },
              };
              const line = calculateLineTotal(cardWithArea, bootstrap);
              const economics = calculateLineEconomics(cardWithArea, bootstrap);
              const filmRequired = service ? FILM_CODES.has(service.service_code) : false;

              return (
                <article key={opening.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 14, background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
                    <strong>{openingIndex + 1}. {opening.name}</strong>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="chip chip-accent">{sqft} sqft · {money(line.line_total)}</span>
                      <button type="button" className="soft-button" onClick={() => removeOpening(room.id, opening.id)} disabled={room.openings.length === 1}>×</button>
                    </div>
                  </div>

                  <div className="calculator-grid">
                    <label className="calculator-field">
                      <span>Окно / зона</span>
                      <input value={opening.name} onChange={(event) => updateOpening(room.id, opening.id, (current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label className="calculator-field">
                      <span>Ширина, in</span>
                      <input type="number" step="0.125" value={opening.widthIn ?? ""} onChange={(event) => updateOpening(room.id, opening.id, (current) => ({ ...current, widthIn: event.target.value === "" ? null : Number(event.target.value) }))} />
                    </label>
                    <label className="calculator-field">
                      <span>Высота, in</span>
                      <input type="number" step="0.125" value={opening.heightIn ?? ""} onChange={(event) => updateOpening(room.id, opening.id, (current) => ({ ...current, heightIn: event.target.value === "" ? null : Number(event.target.value) }))} />
                    </label>
                    <label className="calculator-field">
                      <span>Количество</span>
                      <input type="number" min="1" step="1" value={opening.quantity} onChange={(event) => updateOpening(room.id, opening.id, (current) => ({ ...current, quantity: Math.max(1, Number(event.target.value) || 1) }))} />
                    </label>
                    <label className="calculator-field">
                      <span>Услуга</span>
                      <select
                        value={opening.card.service_type_id ?? ""}
                        onChange={(event) => updateOpening(room.id, opening.id, (current) => ({
                          ...current,
                          card: createCardForServiceType(bootstrap, event.target.value || null, current.card.id),
                        }))}
                      >
                        {bootstrap.service_types.map((item) => <option key={item.service_type_id} value={item.service_type_id}>{item.name_ru}</option>)}
                      </select>
                    </label>
                    {filmRequired ? (
                      <label className="calculator-field">
                        <span>Пленка *</span>
                        <select
                          value={opening.card.film_id ?? ""}
                          onChange={(event) => {
                            const film = bootstrap.film_catalog.find((item) => item.film_id === event.target.value) ?? null;
                            updateOpening(room.id, opening.id, (current) => ({
                              ...current,
                              card: {
                                ...current.card,
                                film_id: film?.film_id ?? null,
                                selected_category_code: film?.category_code ?? current.card.selected_category_code,
                                selected_brand_code: film?.brand_code ?? null,
                                dynamic_fields: {
                                  ...current.card.dynamic_fields,
                                  model: film?.model_code ?? null,
                                  thickness: film?.thickness ?? null,
                                },
                              },
                            }));
                          }}
                        >
                          <option value="">Выберите пленку</option>
                          {films.map((film) => (
                            <option key={film.film_id} value={film.film_id}>{film.brand_name_ru} · {film.model_name_ru}{film.thickness ? ` · ${film.thickness}` : ""}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="calculator-field">
                      <span>Прайс / sqft</span>
                      <input type="number" value={service?.base_price ?? 0} readOnly />
                    </label>
                    <label className="calculator-field">
                      <span>Цена клиенту / sqft</span>
                      <input
                        type="number"
                        step="0.01"
                        value={opening.card.pricing.service_unit_price_override ?? service?.base_price ?? 0}
                        onChange={(event) => updateOpening(room.id, opening.id, (current) => ({
                          ...current,
                          card: {
                            ...current.card,
                            pricing: {
                              ...current.card.pricing,
                              service_unit_price_override: event.target.value === "" ? null : Number(event.target.value),
                            },
                          },
                        }))}
                      />
                    </label>
                  </div>

                  {filmRequired && opening.card.film_id ? (
                    <div style={{ marginTop: 10 }}>
                      <button type="button" className="soft-button" onClick={() => applyFilmToRoom(room.id, opening)}>
                        Применить эту пленку ко всей комнате
                      </button>
                    </div>
                  ) : null}

                  {showInternalEconomics ? (
                    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
                      <div className="chip">Пленка: {money(economics.material_cost_total)}</div>
                      <div className="chip">Монтаж: {money(economics.installation_cost_total)}</div>
                      <div className="chip">Прямые затраты: {money(economics.estimated_cost_total)}</div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {showInternalEconomics ? (
        <section className="surface" style={{ padding: 18 }}>
          <div className="page-kicker">РАСХОДЫ ПРОЕКТА · ТОЛЬКО ВЛАДЕЛЕЦ</div>
          <h2 className="detail-heading" style={{ margin: "4px 0 14px" }}>Постоянные и переменные расходы</h2>
          <div className="calculator-grid">
            <label className="calculator-field">
              <span>Доля постоянных расходов на заказ</span>
              <input type="number" step="0.01" value={fixedCost} onChange={(event) => setFixedCost(Math.max(0, Number(event.target.value) || 0))} />
              <small>Рекомендация из текущего overhead: {money(recommendedFixedCost)} / заказ. Месячный overhead: {money(monthlyOverhead)}.</small>
            </label>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {variableExpenses.map((expense) => (
              <div key={expense.id} style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) 140px auto", gap: 8 }}>
                <input value={expense.label} placeholder="Доставка, парковка, lift, бензин…" onChange={(event) => setVariableExpenses((current) => current.map((item) => item.id === expense.id ? { ...item, label: event.target.value } : item))} />
                <input type="number" step="0.01" value={expense.amount} onChange={(event) => setVariableExpenses((current) => current.map((item) => item.id === expense.id ? { ...item, amount: Math.max(0, Number(event.target.value) || 0) } : item))} />
                <button type="button" className="soft-button" onClick={() => setVariableExpenses((current) => current.filter((item) => item.id !== expense.id))}>×</button>
              </div>
            ))}
            <button type="button" className="soft-button" style={{ justifySelf: "start" }} onClick={() => setVariableExpenses((current) => [...current, { id: nextId("expense"), label: "", amount: 0 }])}>
              + Переменный расход
            </button>
          </div>
        </section>
      ) : null}

      <section className="surface" style={{ padding: 18 }}>
        <div className="page-kicker">ИТОГ ПО ЗАКАЗУ</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 10, marginTop: 10 }}>
          <div className="card"><div className="row-meta">Площадь</div><strong>{totalSqft} sqft</strong></div>
          <div className="card"><div className="row-meta">Цена клиенту</div><strong>{money(quotedTotal)}</strong></div>
          {showInternalEconomics ? <>
            <div className="card"><div className="row-meta">Пленка</div><strong>{money(materialCost)}</strong></div>
            <div className="card"><div className="row-meta">Монтаж</div><strong>{money(installationCost)}</strong></div>
            <div className="card"><div className="row-meta">Доп. переменные</div><strong>{money(variableCost)}</strong></div>
            <div className="card"><div className="row-meta">Постоянные</div><strong>{money(fixedCost)}</strong></div>
            <div className="card"><div className="row-meta">Полная себестоимость</div><strong>{money(fullCost)}</strong></div>
            <div className="card"><div className="row-meta">Прибыль</div><strong>{money(profit)} · {margin}%</strong></div>
          </> : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
          <button type="button" className="accent-button" onClick={saveProposal} disabled={saving}>
            {deal ? "Сохранить как КП" : "Расчет готов"}
          </button>
          {message ? <span className="row-meta">{message}</span> : null}
        </div>
      </section>
    </div>
  );
}
