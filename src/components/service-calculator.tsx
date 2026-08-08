"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  calculateEconomicsSummary,
  calculateLineEconomics,
  calculateLineTotal,
  calculateSummary,
  createAddonSelection,
  createCardForServiceType,
  getAllowedFilmCategoryCodes,
  getServiceAddonById,
  getServiceAddons,
  getServiceFields,
  getServiceLogicSummary,
  getServiceTypeById,
} from "@/features/calculator/logic";
import type {
  CalculatorBootstrap,
  CalculatorCard,
  CalculatorFieldConfig,
} from "@/features/calculator/types";

type ServiceCalculatorProps = {
  bootstrap: CalculatorBootstrap;
  deal?: any | null;
  showInternalEconomics?: boolean;
};

type ApiEnvelope = {
  data?: Record<string, any>;
  errors?: Array<{
    message?: string;
  }>;
};

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function getDefaultSqft(card: CalculatorCard) {
  const value = card.dynamic_fields.sqft;
  return typeof value === "number" ? value : 0;
}

function syncSqftAddonQuantities(
  card: CalculatorCard,
  bootstrap: CalculatorBootstrap,
  nextSqft: number | null,
) {
  const previousSqft = getDefaultSqft(card);

  return card.addons.map((addon) => {
    const referenceAddon = getServiceAddonById(bootstrap.service_addons, addon.service_addon_id);

    if (!referenceAddon || referenceAddon.unit_type !== "sqft") {
      return addon;
    }

    if (addon.quantity === null || addon.quantity === previousSqft) {
      return {
        ...addon,
        quantity: nextSqft && nextSqft > 0 ? nextSqft : null,
      };
    }

    return addon;
  });
}

function getFieldOptions(field: CalculatorFieldConfig) {
  if (field.default_value?.options) {
    return field.default_value.options.map((option) => ({
      value: option.value,
      label: option.label_ru,
    }));
  }

  return [];
}

async function parseEnvelope(response: Response) {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message ?? "Request failed.");
  }

  return payload.data;
}

export function ServiceCalculator({
  bootstrap,
  deal,
  showInternalEconomics = false,
}: ServiceCalculatorProps) {
  const router = useRouter();
  const [cards, setCards] = useState<CalculatorCard[]>([
    createCardForServiceType(bootstrap, bootstrap.service_types[0]?.service_type_id ?? null, "card-1"),
  ]);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState(
    deal ? "Расчет уже привязан к сделке. Следующий шаг — сохранить КП или перейти к текущему проекту." : "",
  );
  const summary = calculateSummary(cards, bootstrap);
  const economicsSummary = showInternalEconomics
    ? calculateEconomicsSummary(cards, bootstrap)
    : null;
  const latestProposal = deal?.workflow?.latest_proposal ?? null;
  const latestDeposit = latestProposal?.deposit ?? null;
  const latestProject = deal?.workflow?.latest_project ?? latestProposal?.project ?? null;
  const canSaveProposal = Boolean(deal?.deal_id);
  const canCreateProject = Boolean(
    latestProposal?.proposal_id &&
      latestProposal.status === "approved" &&
      latestDeposit?.status === "paid" &&
      !latestProject?.project_id,
  );

  async function runDealAction(label: string, action: () => Promise<void>) {
    setSaving(true);
    setActionMessage(label);

    try {
      await action();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Операция не выполнена.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAsProposal() {
    if (!deal?.deal_id) {
      throw new Error("Calculator должен быть открыт в контексте сделки.");
    }

    const data = await parseEnvelope(
      await fetch("/api/v1/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deal_id: deal.deal_id,
          calculator_cards: cards,
        }),
      }),
    );

    setActionMessage("КП создано из calculator и привязано к сделке.");
    router.push(`/manager/crm/proposals/${data.proposal.proposal_id}`);
    router.refresh();
  }

  async function createProject() {
    if (!latestProposal?.proposal_id) {
      throw new Error("Сначала нужен approved proposal.");
    }

    const data = await parseEnvelope(
      await fetch("/api/v1/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proposal_id: latestProposal.proposal_id,
        }),
      }),
    );

    setActionMessage("Проект создан из текущего КП.");
    router.push(`/manager/projects/${data.project.project_id}`);
    router.refresh();
  }

  function updateCard(cardId: string, updater: (card: CalculatorCard) => CalculatorCard) {
    setCards((current) => current.map((card) => (card.id === cardId ? updater(card) : card)));
  }

  function handleAddCard() {
    setCards((current) => [
      ...current,
      createCardForServiceType(bootstrap, bootstrap.service_types[0]?.service_type_id ?? null),
    ]);
  }

  function handleRemoveCard(cardId: string) {
    setCards((current) => (current.length > 1 ? current.filter((card) => card.id !== cardId) : current));
  }

  return (
    <div className="calculator-shell">
      <section className="calculator-workspace">
        <div className="calculator-toolbar">
          <div>
            <div className="page-kicker">Расчет по прайс-листу</div>
            <h2 className="detail-heading">Конструктор услуг</h2>
            <div className="detail-meta">
              <span>Добавьте услуги, размеры и дополнительные работы.</span>
              <span>Итог для клиента пересчитывается автоматически.</span>
            </div>
          </div>

          <button type="button" className="accent-button" onClick={handleAddCard}>
            Добавить услугу
          </button>
        </div>

        <div className="calculator-card-stack">
          {cards.map((card, index) => {
            const serviceType = getServiceTypeById(bootstrap.service_types, card.service_type_id);
            const fields = getServiceFields(bootstrap.service_field_config, bootstrap.service_types, card.service_type_id);
            const availableAddons = getServiceAddons(bootstrap.service_addons, card.service_type_id);
            const line = calculateLineTotal(card, bootstrap);
            const economics = showInternalEconomics
              ? calculateLineEconomics(card, bootstrap)
              : null;

            const allowedCategoryCodes = getAllowedFilmCategoryCodes(serviceType?.service_code ?? null);
            const categoryFilms = bootstrap.film_catalog.filter((film) =>
              allowedCategoryCodes.includes(film.category_code),
            );
            const brandOptions = categoryFilms.filter(
              (film) => !card.selected_category_code || film.category_code === card.selected_category_code,
            );
            const uniqueBrands = brandOptions.filter(
              (film, optionIndex, items) =>
                items.findIndex(
                  (candidate) =>
                    candidate.category_code === film.category_code && candidate.brand_code === film.brand_code,
                ) === optionIndex,
            );
            const modelOptions = brandOptions.filter(
              (film) =>
                (!card.selected_category_code || film.category_code === card.selected_category_code) &&
                (!card.selected_brand_code || film.brand_code === card.selected_brand_code),
            );
            const selectedAddonIds = new Set(
              card.addons
                .map((item) => item.service_addon_id)
                .filter((value): value is string => Boolean(value)),
            );
            const unusedAddonCount =
              availableAddons.length -
              new Set(
                card.addons
                  .map((item) => item.service_addon_id)
                  .filter((value): value is string => Boolean(value)),
              ).size;

            return (
              <article key={card.id} className="calculator-card">
                <div className="calculator-card-head">
                  <div>
                    <div className="page-kicker mono">УСЛУГА {index + 1}</div>
                    <div className="calculator-service-title">
                      {serviceType?.name_ru ?? "Выберите тип услуги"}
                    </div>
                    <div className="row-meta">{getServiceLogicSummary(serviceType?.service_code ?? null)}</div>
                  </div>

                  <div className="calculator-card-actions">
                    <div className="chip chip-accent">{formatCurrency(line.line_total)}</div>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() => handleRemoveCard(card.id)}
                      disabled={cards.length === 1}
                    >
                      Удалить
                    </button>
                  </div>
                </div>

                <div className="calculator-grid">
                  <label className="calculator-field">
                    <span>Категория услуги</span>
                    <select
                      value={card.service_type_id ?? ""}
                      onChange={(event) => {
                        updateCard(card.id, () =>
                          createCardForServiceType(bootstrap, event.target.value || null, card.id),
                        );
                      }}
                    >
                      <option value="">Выберите услугу</option>
                      {bootstrap.service_types.map((serviceOption) => (
                        <option key={serviceOption.service_type_id} value={serviceOption.service_type_id}>
                          {serviceOption.name_ru}
                        </option>
                      ))}
                    </select>
                  </label>

                  {serviceType ? (
                    <>
                      {fields.map((field) => {
                        if (field.field_key === "category") {
                          return null;
                        }

                        if (field.field_key === "brand") {
                          return (
                            <label key={field.service_field_config_id} className="calculator-field">
                              <span>{field.field_label_ru}</span>
                              <select
                                value={card.selected_brand_code ?? ""}
                                onChange={(event) => {
                                  const nextBrand = event.target.value || null;
                                  updateCard(card.id, (current) => ({
                                    ...current,
                                    selected_brand_code: nextBrand,
                                    film_id: null,
                                    dynamic_fields: {
                                      ...current.dynamic_fields,
                                      brand: nextBrand,
                                      model: null,
                                      thickness: null,
                                    },
                                  }));
                                }}
                              >
                                <option value="">Выберите бренд</option>
                                {uniqueBrands.map((brand) => (
                                  <option key={`${brand.category_code}-${brand.brand_code}`} value={brand.brand_code}>
                                    {brand.brand_name_ru}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        }

                        if (field.field_key === "model") {
                          return (
                            <label key={field.service_field_config_id} className="calculator-field">
                              <span>{field.field_label_ru}</span>
                              <select
                                value={card.film_id ?? ""}
                                onChange={(event) => {
                                  const nextFilmId = event.target.value || null;
                                  const nextFilm =
                                    bootstrap.film_catalog.find((film) => film.film_id === nextFilmId) ?? null;

                                  updateCard(card.id, (current) => ({
                                    ...current,
                                    film_id: nextFilmId,
                                    dynamic_fields: {
                                      ...current.dynamic_fields,
                                      model: nextFilm?.model_code ?? null,
                                      thickness: nextFilm?.thickness ?? null,
                                    },
                                  }));
                                }}
                              >
                                <option value="">Выберите модель</option>
                                {modelOptions.map((film) => (
                                  <option key={film.film_id} value={film.film_id}>
                                    {film.model_name_ru}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        }

                        if (field.input_type === "select") {
                          const options = getFieldOptions(field);

                          return (
                            <label key={field.service_field_config_id} className="calculator-field">
                              <span>{field.field_label_ru}</span>
                              <select
                                value={String(card.dynamic_fields[field.field_key] ?? "")}
                                onChange={(event) => {
                                  const nextValue = event.target.value || null;
                                  updateCard(card.id, (current) => ({
                                    ...current,
                                    dynamic_fields: {
                                      ...current.dynamic_fields,
                                      [field.field_key]: nextValue,
                                    },
                                  }));
                                }}
                              >
                                <option value="">Выберите значение</option>
                                {options.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        }

                        const isNumeric = field.data_type === "integer" || field.data_type === "decimal";

                        return (
                          <label key={field.service_field_config_id} className="calculator-field">
                            <span>{field.field_label_ru}</span>
                            <input
                              type={isNumeric ? "number" : "text"}
                              step={field.data_type === "decimal" ? "0.01" : "1"}
                              value={String(card.dynamic_fields[field.field_key] ?? "")}
                              onChange={(event) => {
                                const rawValue = event.target.value;
                                const nextValue = rawValue === "" ? null : isNumeric ? Number(rawValue) : rawValue;
                                updateCard(card.id, (current) => ({
                                  ...current,
                                  dynamic_fields: {
                                    ...current.dynamic_fields,
                                    [field.field_key]: nextValue,
                                  },
                                  addons:
                                    field.field_key === "sqft"
                                      ? syncSqftAddonQuantities(
                                          current,
                                          bootstrap,
                                          typeof nextValue === "number" ? nextValue : null,
                                        )
                                      : current.addons,
                                }));
                              }}
                            />
                          </label>
                        );
                      })}
                    </>
                  ) : null}
                </div>

                {serviceType ? (
                  <section className="calculator-pricing-panel">
                    <div className="calculator-pricing-grid">
                      <label className="calculator-field">
                        <span>Цена из прайса</span>
                        <input type="number" value={serviceType.base_price} readOnly />
                      </label>
                      <label className="calculator-field">
                        <span>Минимальная цена</span>
                        <input type="number" value={serviceType.min_price} readOnly />
                      </label>
                      <label className="calculator-field">
                        <span>Цена клиенту / sqft</span>
                        <input
                          type="number"
                          step="0.01"
                          value={card.pricing.service_unit_price_override ?? serviceType.base_price}
                          onChange={(event) => {
                            updateCard(card.id, (current) => ({
                              ...current,
                              pricing: {
                                ...current.pricing,
                                service_unit_price_override:
                                  event.target.value === "" ? null : Number(event.target.value),
                              },
                            }));
                          }}
                        />
                      </label>

                      {serviceType.service_code === "SMART_FILM" ? (
                        <>
                          <label className="calculator-field">
                            <span>Цена блока из прайса</span>
                            <input type="number" value={serviceType.block_revenue_price} readOnly />
                          </label>
                          <label className="calculator-field">
                            <span>Цена блока клиенту</span>
                            <input
                              type="number"
                              step="0.01"
                              value={card.pricing.block_unit_price_override ?? serviceType.block_revenue_price}
                              onChange={(event) => {
                                updateCard(card.id, (current) => ({
                                  ...current,
                                  pricing: {
                                    ...current.pricing,
                                    block_unit_price_override:
                                      event.target.value === "" ? null : Number(event.target.value),
                                  },
                                }));
                              }}
                            />
                          </label>
                        </>
                      ) : null}
                    </div>

                    {line.below_minimum_warning ? (
                      <div className="calculator-warning-list">
                        {line.warnings.map((warning) => (
                          <div key={`${card.id}-${warning}`} className="calculator-warning-item">
                            {warning}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <div className="calculator-addon-band">
                  <div className="calculator-addon-header">
                    <div>
                      <div className="calculator-section-heading">Допуслуги</div>
                      <div className="row-meta">
                        Допуслуги выбираются из прайса и влияют только на клиентскую стоимость строки.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() => {
                        updateCard(card.id, (current) => {
                          const nextReference =
                            availableAddons.find((addon) => !selectedAddonIds.has(addon.service_addon_id)) ?? null;

                          if (!nextReference) {
                            return current;
                          }

                          return {
                            ...current,
                            addons: [
                              ...current.addons,
                              createAddonSelection(nextReference, getDefaultSqft(current)),
                            ],
                          };
                        });
                      }}
                      disabled={availableAddons.length === 0 || unusedAddonCount <= 0}
                    >
                      Добавить допуслугу
                    </button>
                  </div>

                  <div className="calculator-addon-list">
                    {card.addons.length === 0 ? (
                      <div className="empty-state">
                        Добавьте мойку, удаление, силикон или другую клиентскую допуслугу.
                      </div>
                    ) : (
                      card.addons.map((selectedAddon) => {
                        const referenceAddon = getServiceAddonById(
                          bootstrap.service_addons,
                          selectedAddon.service_addon_id,
                        );

                        const dropdownOptions = availableAddons.filter(
                          (addon) =>
                            addon.service_addon_id === selectedAddon.service_addon_id ||
                            !selectedAddonIds.has(addon.service_addon_id),
                        );

                        return (
                          <div key={selectedAddon.id} className="calculator-addon-row calculator-addon-row-selected">
                            <div className="calculator-addon-grid">
                              <label className="calculator-field">
                                <span>Допуслуга</span>
                                <select
                                  value={selectedAddon.service_addon_id ?? ""}
                                  onChange={(event) => {
                                    const nextAddon =
                                      getServiceAddonById(bootstrap.service_addons, event.target.value || null) ?? null;

                                    updateCard(card.id, (current) => ({
                                      ...current,
                                      addons: current.addons.map((item) =>
                                        item.id === selectedAddon.id
                                          ? createAddonSelection(nextAddon, getDefaultSqft(current), item.id)
                                          : item,
                                      ),
                                    }));
                                  }}
                                >
                                  <option value="">Выберите допуслугу</option>
                                  {dropdownOptions.map((addon) => (
                                    <option key={addon.service_addon_id} value={addon.service_addon_id}>
                                      {addon.name_ru}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="calculator-field">
                                <span>{referenceAddon?.unit_type === "sqft" ? "Sqft допуслуги" : "Количество"}</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={selectedAddon.quantity ?? ""}
                                  onChange={(event) => {
                                    updateCard(card.id, (current) => ({
                                      ...current,
                                      addons: current.addons.map((item) =>
                                        item.id === selectedAddon.id
                                          ? {
                                              ...item,
                                              quantity:
                                                event.target.value === "" ? null : Number(event.target.value),
                                            }
                                          : item,
                                      ),
                                    }));
                                  }}
                                />
                              </label>

                              <label className="calculator-field">
                                <span>Цена из прайса / ручная</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={
                                    selectedAddon.unit_price_override ??
                                    (referenceAddon ? referenceAddon.default_price : 0)
                                  }
                                  onChange={(event) => {
                                    updateCard(card.id, (current) => ({
                                      ...current,
                                      addons: current.addons.map((item) =>
                                        item.id === selectedAddon.id
                                          ? {
                                              ...item,
                                              unit_price_override:
                                                event.target.value === "" ? null : Number(event.target.value),
                                            }
                                          : item,
                                      ),
                                    }));
                                  }}
                                />
                              </label>

                              {referenceAddon?.addon_code === "OTHER" ? (
                                <label className="calculator-field calculator-addon-description">
                                  <span>Что это за другое</span>
                                  <input
                                    type="text"
                                    placeholder="Например: trim work или нестандартная подготовка"
                                    value={selectedAddon.manual_label ?? ""}
                                    onChange={(event) => {
                                      updateCard(card.id, (current) => ({
                                        ...current,
                                        addons: current.addons.map((item) =>
                                          item.id === selectedAddon.id
                                            ? {
                                                ...item,
                                                manual_label: event.target.value,
                                              }
                                            : item,
                                        ),
                                      }));
                                    }}
                                  />
                                </label>
                              ) : null}
                            </div>

                            <div className="calculator-addon-side">
                              <div className="row-meta">
                                {referenceAddon
                                  ? `Прайс ${formatCurrency(referenceAddon.default_price)} · минимум ${formatCurrency(referenceAddon.min_price)}`
                                  : "Выберите допуслугу"}
                              </div>
                              <button
                                type="button"
                                className="soft-button"
                                onClick={() => {
                                  updateCard(card.id, (current) => ({
                                    ...current,
                                    addons: current.addons.filter((item) => item.id !== selectedAddon.id),
                                  }));
                                }}
                              >
                                Удалить
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="calculator-line-footer calculator-line-footer-rich">
                  <div className="calculator-breakdown">
                    <div className="calculator-breakdown-title">Состав цены</div>
                    {line.breakdown.length ? (
                      line.breakdown.map((item) => (
                        <div key={`${card.id}-${item.label}`} className="calculator-breakdown-row">
                          <span>{item.label}</span>
                          <strong>{formatCurrency(item.amount)}</strong>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state">Заполните карточку, чтобы увидеть line total.</div>
                    )}
                  </div>

                  <div className="calculator-metric-grid">
                    <div className="calculator-metric-card">
                      <span>Сумма услуги</span>
                      <strong>{formatCurrency(line.line_total)}</strong>
                    </div>
                    <div className="calculator-metric-card">
                      <span>Допуслуги</span>
                      <strong>{card.addons.length}</strong>
                    </div>
                  </div>

                  {economics ? (
                  <section className="calculator-economics-panel">
                    <div className="calculator-breakdown-title">Внутренняя экономика</div>
                    <div className="project-finance-grid">
                      <div className="calculator-metric-card">
                        <span>Выручка</span>
                        <strong>{formatCurrency(economics.quoted_revenue)}</strong>
                      </div>
                      <div className="calculator-metric-card">
                        <span>Себестоимость</span>
                        <strong>{formatCurrency(economics.estimated_cost_total)}</strong>
                      </div>
                      <div className="calculator-metric-card">
                        <span>Прибыль</span>
                        <strong>{formatCurrency(economics.estimated_profit)}</strong>
                      </div>
                      <div className="calculator-metric-card">
                        <span>Маржа</span>
                        <strong>{economics.estimated_margin_percent.toFixed(1)}%</strong>
                      </div>
                    </div>

                    <div className="inspector-list">
                      <div className="inspector-item">
                        <div className="row-title">Состав себестоимости</div>
                        <div className="row-meta">
                          материал {formatCurrency(economics.material_cost_total)} • монтаж{" "}
                          {formatCurrency(economics.installation_cost_total)} • блоки{" "}
                          {formatCurrency(economics.block_cost_total)} • допы{" "}
                          {formatCurrency(economics.addon_cost_total)}
                        </div>
                      </div>
                    </div>
                  </section>
                  ) : null}

                  <label className="calculator-notes">
                    <span>Заметки по услуге</span>
                    <textarea
                      rows={3}
                      value={card.notes}
                      onChange={(event) => {
                        updateCard(card.id, (current) => ({
                          ...current,
                          notes: event.target.value,
                        }));
                      }}
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="calculator-summary">
        <section className="surface calculator-summary-surface">
          <div className="page-kicker">Итог</div>
          <h3 className="surface-title">Расчет для клиента</h3>
          <div className="calculator-total-stack">
            <div className="calculator-total-row">
              <span>Услуги</span>
              <strong>{cards.length}</strong>
            </div>
            <div className="calculator-total-row calculator-total-row-strong">
              <span>Итого</span>
              <strong>{formatCurrency(summary.total)}</strong>
            </div>
          </div>

          <div className="calculator-summary-list">
            {summary.line_items.map((item) => (
              <div key={item.id} className="calculator-summary-item">
                <div className="row-title">{item.service_name}</div>
                <strong>{formatCurrency(item.total)}</strong>
              </div>
            ))}
          </div>
        </section>

        {economicsSummary ? (
        <section className="surface calculator-summary-surface">
          <div className="page-kicker">Только владелец</div>
          <h3 className="surface-title">Экономика сделки</h3>
          <div className="calculator-total-stack">
            <div className="calculator-total-row">
              <span>Выручка</span>
              <strong>{formatCurrency(economicsSummary.quoted_revenue_total)}</strong>
            </div>
            <div className="calculator-total-row">
              <span>Себестоимость</span>
              <strong>{formatCurrency(economicsSummary.estimated_cost_total)}</strong>
            </div>
            <div className="calculator-total-row calculator-total-row-strong">
              <span>Прибыль</span>
              <strong>{formatCurrency(economicsSummary.estimated_profit_total)}</strong>
            </div>
            <div className="calculator-total-row">
              <span>Маржа</span>
              <strong>{economicsSummary.estimated_margin_percent.toFixed(1)}%</strong>
            </div>
          </div>

          <div className="calculator-economics-list">
            {economicsSummary.line_items.map((item) => (
              <div key={item.id} className="calculator-economics-item">
                <div>
                  <div className="row-title">{item.service_name}</div>
                  <div className="row-meta">
                    выручка {formatCurrency(item.quoted_revenue)} • себестоимость{" "}
                    {formatCurrency(item.estimated_cost_total)}
                  </div>
                </div>
                <div className="calculator-economics-profit">
                  <strong>{formatCurrency(item.estimated_profit)}</strong>
                  <span>{item.estimated_margin_percent.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </section>
        ) : null}

        {deal ? (
          <section className="surface calculator-summary-surface">
            <div className="page-kicker">Сделка</div>
            <h3 className="surface-title">Дальнейшие действия</h3>
            <div className="inspector-list">
              <div className="inspector-item">
                <div className="row-title">{deal.deal_code}</div>
                <div className="row-meta">
                  {deal.title} · {deal.client?.name ?? deal.lead?.name ?? "Без клиента"}
                </div>
              </div>
              <div className="inspector-item">
                <div className="row-title">Последнее КП</div>
                <div className="row-meta">
                  {latestProposal
                    ? `${latestProposal.status} · ${formatCurrency(latestProposal.selected_total_amount, latestProposal.currency)}`
                    : "Пока не создано"}
                </div>
              </div>
              <div className="inspector-item">
                <div className="row-title">Deposit</div>
                <div className="row-meta">
                  {latestDeposit
                    ? `${latestDeposit.status} · ${formatCurrency(latestDeposit.amount, latestProposal?.currency ?? "USD")}`
                    : "Не создан"}
                </div>
              </div>
              <div className="inspector-item">
                <div className="row-title">Project</div>
                <div className="row-meta">
                  {latestProject
                    ? `${latestProject.project_code ?? latestProject.project_id} · ${latestProject.project_status?.name_ru ?? "Создан"}`
                    : "Проект еще не создан"}
                </div>
              </div>
            </div>

            {actionMessage ? (
              <div className="inspector-item" style={{ marginTop: 16 }}>
                <div className="row-title">Статус</div>
                <div className="row-meta">{actionMessage}</div>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
              <button
                type="button"
                className="accent-button"
                onClick={() => runDealAction("Сохраняю КП из calculator...", saveAsProposal)}
                disabled={saving || !canSaveProposal}
              >
                Сохранить как КП
              </button>

              {latestProposal ? (
                <Link href={`/manager/crm/proposals/${latestProposal.proposal_id}`} className="soft-button">
                  Открыть КП
                </Link>
              ) : null}

              {canCreateProject ? (
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => runDealAction("Создаю проект из approved КП...", createProject)}
                  disabled={saving}
                >
                  Создать проект
                </button>
              ) : null}

              {latestProject?.project_id ? (
                <Link href={`/manager/projects/${latestProject.project_id}`} className="soft-button">
                  Открыть проект
                </Link>
              ) : null}

              <Link href={`/manager/crm/deals/${deal.deal_id}`} className="soft-button">
                Назад к сделке
              </Link>
            </div>
          </section>
        ) : null}

      </aside>
    </div>
  );
}
