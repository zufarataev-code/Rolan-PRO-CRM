"use client";

import { useMemo, useState } from "react";

import {
  calculateLineTotal,
  createAddonSelection,
  createCardForServiceType,
  createEmptyCard,
  getAllowedFilmCategoryCodes,
  getServiceAddonById,
  getServiceAddons,
  getServiceFields,
  getServiceTypeById,
} from "@/features/calculator/logic";
import type {
  CalculatorBootstrap,
  CalculatorCard,
  CalculatorCardAddon,
  CalculatorFilm,
} from "@/features/calculator/types";

type ProposalBuilderProps = {
  initialProposal: any;
  calculatorBootstrap: CalculatorBootstrap;
};

type NewItemMeta = {
  room_name: string;
  zone_name: string;
  window_id: string;
  is_optional: boolean;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function parseNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return 0;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getCardFilms(bootstrap: CalculatorBootstrap, card: CalculatorCard) {
  const serviceType = getServiceTypeById(bootstrap.service_types, card.service_type_id);
  const allowedCategories = getAllowedFilmCategoryCodes(serviceType?.service_code ?? null);

  return bootstrap.film_catalog.filter((film) =>
    allowedCategories.length === 0 ? true : allowedCategories.includes(film.category_code),
  );
}

function getCategoryOptions(bootstrap: CalculatorBootstrap, card: CalculatorCard) {
  return uniqueBy(getCardFilms(bootstrap, card), (film) => film.category_code).map((film) => ({
    value: film.category_code,
    label: film.category_name_ru,
  }));
}

function getBrandOptions(bootstrap: CalculatorBootstrap, card: CalculatorCard) {
  return uniqueBy(
    getCardFilms(bootstrap, card).filter((film) =>
      card.selected_category_code ? film.category_code === card.selected_category_code : true,
    ),
    (film) => `${film.category_code}:${film.brand_code}`,
  ).map((film) => ({
    value: film.brand_code,
    label: film.brand_name_ru,
  }));
}

function getFilmOptions(bootstrap: CalculatorBootstrap, card: CalculatorCard) {
  return getCardFilms(bootstrap, card).filter((film) => {
    if (card.selected_category_code && film.category_code !== card.selected_category_code) {
      return false;
    }

    if (card.selected_brand_code && film.brand_code !== card.selected_brand_code) {
      return false;
    }

    return true;
  });
}

function buildProposalTitles(meta: NewItemMeta, serviceNameRu: string, serviceNameEn: string) {
  const room = meta.room_name.trim();

  return {
    title_ru: room ? `${room} · ${serviceNameRu}` : serviceNameRu,
    title_en: room ? `${room} · ${serviceNameEn}` : serviceNameEn,
  };
}

function buildProposalDescriptions(card: CalculatorCard, film: CalculatorFilm | null) {
  const note = card.notes.trim();
  const baseRu = film ? `${film.brand_name_ru} ${film.model_name_ru}` : null;
  const baseEn = film ? `${film.brand_name_en} ${film.model_name_en}` : null;

  return {
    description_ru: [baseRu, note || null].filter(Boolean).join(" · ") || null,
    description_en: [baseEn, note || null].filter(Boolean).join(" · ") || null,
  };
}

function normalizeAddonSnapshot(addon: CalculatorCardAddon, bootstrap: CalculatorBootstrap) {
  const referenceAddon = getServiceAddonById(bootstrap.service_addons, addon.service_addon_id);

  if (!referenceAddon) {
    return null;
  }

  return {
    ...addon,
    addon_code: referenceAddon.addon_code,
    name_ru: referenceAddon.name_ru,
    name_en: referenceAddon.name_en,
    unit_type: referenceAddon.unit_type,
    quantity:
      addon.quantity ?? (referenceAddon.unit_type === "sqft" ? 0 : 1),
    unit_price_override:
      addon.unit_price_override !== null && addon.unit_price_override !== undefined
        ? addon.unit_price_override
        : referenceAddon.default_price,
    manual_label: addon.manual_label ?? null,
  };
}

function getDynamicFieldSummary(item: any) {
  const fields = item?.dynamic_fields;

  if (!fields || typeof fields !== "object") {
    return [];
  }

  const record = fields as Record<string, unknown>;
  const entries = [
    record.sqft ? `${parseNumber(record.sqft)} sqft` : null,
    record.zones_qty ? `${parseNumber(record.zones_qty)} зон` : null,
    record.blocks_qty ? `${parseNumber(record.blocks_qty)} блоков` : null,
    record.windows_qty ? `${parseNumber(record.windows_qty)} окон` : null,
    typeof record.block_type === "string" && record.block_type.trim() ? `Block: ${record.block_type}` : null,
    typeof record.thickness === "string" && record.thickness.trim() ? `Thickness: ${record.thickness}` : null,
  ];

  return entries.filter((entry): entry is string => Boolean(entry));
}

function getAddonSummary(addonsSnapshot: unknown) {
  if (!Array.isArray(addonsSnapshot)) {
    return [];
  }

  return addonsSnapshot
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const name =
        (typeof record.manual_label === "string" && record.manual_label.trim()) ||
        (typeof record.name_ru === "string" && record.name_ru.trim()) ||
        (typeof record.addon_code === "string" && record.addon_code.trim()) ||
        "Допуслуга";
      const quantity =
        typeof record.quantity === "number"
          ? record.quantity
          : typeof record.quantity === "string" && record.quantity.trim()
            ? Number(record.quantity)
            : null;
      const unitType =
        typeof record.unit_type === "string" && record.unit_type.trim() ? record.unit_type.trim() : null;
      const unitPrice =
        typeof record.unit_price_override === "number"
          ? record.unit_price_override
          : typeof record.unit_price_override === "string" && record.unit_price_override.trim()
            ? Number(record.unit_price_override)
            : null;

      if (quantity && unitType && unitPrice !== null) {
        return `${name} · ${quantity} ${unitType} × ${formatCurrency(unitPrice)}`;
      }

      if (unitPrice !== null) {
        return `${name} · ${formatCurrency(unitPrice)}`;
      }

      return name;
    })
    .filter((entry): entry is string => Boolean(entry));
}

async function parseEnvelope(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: Record<string, any>;
        errors?: Array<{ message?: string }>;
      }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message ?? "Request failed.");
  }

  return payload.data;
}

export function ProposalBuilder({ initialProposal, calculatorBootstrap }: ProposalBuilderProps) {
  const [proposal, setProposal] = useState(initialProposal);
  const [message, setMessage] = useState("Proposal теперь использует ту же service-card логику, что и калькулятор.");
  const [saving, setSaving] = useState(false);
  const [newCard, setNewCard] = useState<CalculatorCard>(() => createEmptyCard(calculatorBootstrap));
  const [newItemMeta, setNewItemMeta] = useState<NewItemMeta>({
    room_name: "",
    zone_name: "",
    window_id: "",
    is_optional: false,
  });

  const newCardLine = useMemo(
    () => calculateLineTotal(newCard, calculatorBootstrap),
    [calculatorBootstrap, newCard],
  );
  const isApproved = proposal.status === "approved" || proposal.status === "finalized";
  const hasDeposit = Boolean(proposal.deposit);
  const isDepositPaid = proposal.deposit?.status === "paid";
  const hasProject = Boolean(proposal.project?.project_id);
  const isMutationLocked = isApproved || hasProject;

  async function saveProposalMeta() {
    setSaving(true);
    setMessage("Сохраняю proposal...");

    try {
      const data = await parseEnvelope(
        await fetch(`/api/v1/proposals/${proposal.proposal_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: proposal.title,
            client_message: proposal.client_message,
            notes: proposal.notes,
          }),
        }),
      );

      setProposal(data.proposal);
      setMessage("Proposal сохранен.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить proposal.");
    } finally {
      setSaving(false);
    }
  }

  async function saveItem(item: any) {
    setSaving(true);
    setMessage("Сохраняю строку...");

    try {
      const data = await parseEnvelope(
        await fetch(`/api/v1/proposals/items/${item.proposal_item_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title_ru: item.title_ru,
            title_en: item.title_en,
            description_ru: item.description_ru,
            description_en: item.description_en,
            room_name: item.room_name,
            zone_name: item.zone_name,
            window_id: item.window_id,
            dynamic_fields: item.dynamic_fields ?? null,
            addons_snapshot: item.addons_snapshot ?? null,
            quantity: item.quantity,
            unit_label: item.unit_label,
            line_price: item.line_price,
            is_optional: item.is_optional,
            client_selected: item.client_selected,
          }),
        }),
      );

      setProposal(data.proposal);
      setMessage("Строка обновлена.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить строку.");
    } finally {
      setSaving(false);
    }
  }

  async function addItem() {
    const serviceType = getServiceTypeById(calculatorBootstrap.service_types, newCard.service_type_id);
    const selectedFilm = calculatorBootstrap.film_catalog.find((film) => film.film_id === newCard.film_id) ?? null;

    if (!serviceType) {
      setMessage("Сначала выберите тип услуги.");
      return;
    }

    setSaving(true);
    setMessage("Добавляю service card в proposal...");

    try {
      const titles = buildProposalTitles(newItemMeta, serviceType.name_ru, serviceType.name_en);
      const descriptions = buildProposalDescriptions(newCard, selectedFilm);
      const addonsSnapshot = newCard.addons
        .map((addon) => normalizeAddonSnapshot(addon, calculatorBootstrap))
        .filter(Boolean);

      const data = await parseEnvelope(
        await fetch(`/api/v1/proposals/${proposal.proposal_id}/items`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            service_type_id: serviceType.service_type_id,
            film_id: newCard.film_id || null,
            room_name: newItemMeta.room_name || null,
            zone_name: newItemMeta.zone_name || null,
            window_id: newItemMeta.window_id || null,
            title_ru: titles.title_ru,
            title_en: titles.title_en,
            description_ru: descriptions.description_ru,
            description_en: descriptions.description_en,
            dynamic_fields: newCard.dynamic_fields,
            addons_snapshot: addonsSnapshot,
            quantity: parseNumber(newCard.dynamic_fields.sqft) || 1,
            unit_label: serviceType.unit_type,
            line_price: newCardLine.line_total,
            is_optional: newItemMeta.is_optional,
            client_selected: !newItemMeta.is_optional,
          }),
        }),
      );

      setProposal(data.proposal);
      setMessage("Новая строка proposal добавлена.");
      setNewCard(createEmptyCard(calculatorBootstrap));
      setNewItemMeta({
        room_name: "",
        zone_name: "",
        window_id: "",
        is_optional: false,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить строку.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    setSaving(true);
    setMessage("Отправляю proposal клиенту...");

    try {
      const data = await parseEnvelope(
        await fetch(`/api/v1/proposals/${proposal.proposal_id}/send`, {
          method: "POST",
        }),
      );

      setProposal(data.proposal);
      setMessage("КП отправлено с info@rolan-pro.com. Клиент получил публичную ссылку без входа в CRM и сможет скачать PDF.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить proposal.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setSaving(true);
    setMessage("Фиксирую selected proposal items...");

    try {
      const data = await parseEnvelope(
        await fetch(`/api/v1/proposals/${proposal.proposal_id}/approve`, {
          method: "POST",
        }),
      );

      setProposal(data.proposal);
      setMessage("Proposal approved. Теперь можно создавать deposit.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось approve proposal.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateDeposit() {
    setSaving(true);
    setMessage("Создаю deposit...");

    try {
      const data = await parseEnvelope(
        await fetch("/api/v1/deposits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            proposal_id: proposal.proposal_id,
          }),
        }),
      );

      setProposal(data.proposal);
      setMessage("Deposit создан.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать deposit.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePayDeposit() {
    if (!proposal.deposit?.deposit_id) {
      return;
    }

    setSaving(true);
    setMessage("Отмечаю deposit как paid...");

    try {
      const data = await parseEnvelope(
        await fetch(`/api/v1/deposits/${proposal.deposit.deposit_id}/pay`, {
          method: "POST",
        }),
      );

      setProposal(data.proposal);
      setMessage("Deposit отмечен как paid. Можно создавать project.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отметить deposit как paid.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateProject() {
    setSaving(true);
    setMessage("Создаю project из approved proposal...");

    try {
      const data = await parseEnvelope(
        await fetch("/api/v1/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            proposal_id: proposal.proposal_id,
          }),
        }),
      );

      setProposal((current: any) => ({
        ...current,
        project: data.project,
      }));
      setMessage("Project создан. Sales handoff завершен, дальше начинается operations.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="proposal-builder-shell">
      <div className="proposal-builder-band">
        <section className="surface">
          <div className="proposal-builder-topbar">
            <div>
              <div className="page-kicker mono">{proposal.proposal_code}</div>
              <h2 className="detail-heading">{proposal.title}</h2>
              <div className="detail-meta">
                <span>{proposal.deal?.title}</span>
                <span>{proposal.client?.name}</span>
                <span className="chip">{proposal.status}</span>
              </div>
            </div>

            <div className="proposal-builder-actions">
              <a href={proposal.public_url} target="_blank" rel="noreferrer" className="soft-button">
                Открыть client page
              </a>
              {!isMutationLocked ? (
                <button type="button" className="accent-button" onClick={handleSend} disabled={saving}>
                  Send to Client
                </button>
              ) : null}
              {!isApproved && !hasProject ? (
                <button type="button" className="soft-button" onClick={handleApprove} disabled={saving}>
                  Approve Proposal
                </button>
              ) : null}
              {isApproved && !hasDeposit && !hasProject ? (
                <button type="button" className="soft-button" onClick={handleCreateDeposit} disabled={saving}>
                  Создать deposit
                </button>
              ) : null}
              {proposal.deposit?.status === "pending" && !hasProject ? (
                <button type="button" className="soft-button" onClick={handlePayDeposit} disabled={saving}>
                  Deposit paid
                </button>
              ) : null}
              {isApproved && isDepositPaid && !hasProject ? (
                <button type="button" className="accent-button" onClick={handleCreateProject} disabled={saving}>
                  Создать проект
                </button>
              ) : null}
              {hasProject ? (
                <a href={`/manager/projects/${proposal.project.project_id}`} className="soft-button">
                  Открыть project
                </a>
              ) : null}
            </div>
          </div>

          <div className="proposal-meta-grid">
            <label className="calculator-field">
              <span>Название proposal</span>
              <input
                value={proposal.title ?? ""}
                onChange={(event) => setProposal((current: any) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <label className="calculator-field">
              <span>Client message</span>
              <input
                value={proposal.client_message ?? ""}
                onChange={(event) =>
                  setProposal((current: any) => ({ ...current, client_message: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="calculator-notes">
            <span>Внутренние notes</span>
            <textarea
              value={proposal.notes ?? ""}
              onChange={(event) => setProposal((current: any) => ({ ...current, notes: event.target.value }))}
            />
          </label>

          <div className="proposal-builder-footer">
            <button
              type="button"
              className="accent-button"
              onClick={saveProposalMeta}
              disabled={saving || isMutationLocked}
            >
              Сохранить proposal
            </button>
            <div className="row-meta">{message}</div>
          </div>
        </section>

        <section className="surface">
          <h3 className="surface-title">Proposal Items</h3>
          <p className="surface-subtitle">
            Сервисные строки уже хранят `dynamic_fields` и `addons_snapshot`. В проект позже переходят только выбранные позиции.
          </p>
          {isMutationLocked ? (
            <div className="row-meta">
              Proposal уже finalized для handoff. Изменения строк заблокированы, доступен только переход в project.
            </div>
          ) : null}

          <div className="proposal-item-list">
            {proposal.items.map((item: any) => {
              const fieldSummary = getDynamicFieldSummary(item);
              const addonSummary = getAddonSummary(item.addons_snapshot);

              return (
                <article key={item.proposal_item_id} className="proposal-item-card">
                  <div className="proposal-item-head">
                    <div>
                      <div className="row-title">{item.room_name ?? item.title_ru}</div>
                      <div className="row-meta">
                        {item.service_type?.name_ru ?? "Услуга"} ·{" "}
                        {item.film ? `${item.film.brand_name_ru} ${item.film.model_name_ru}` : "без пленки"}
                      </div>
                    </div>
                    <div className="chip chip-accent">{formatCurrency(item.line_price)}</div>
                  </div>

                  {(fieldSummary.length > 0 || addonSummary.length > 0) && (
                    <div className="proposal-detail-stack">
                      {fieldSummary.length > 0 && (
                        <div className="proposal-detail-group">
                          <div className="row-meta proposal-detail-label">Service details</div>
                          <div className="proposal-detail-chips">
                            {fieldSummary.map((summary) => (
                              <span key={summary} className="chip">
                                {summary}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {addonSummary.length > 0 && (
                        <div className="proposal-detail-group">
                          <div className="row-meta proposal-detail-label">Addons</div>
                          <div className="proposal-detail-list">
                            {addonSummary.map((summary) => (
                              <div key={summary} className="row-meta">
                                {summary}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="proposal-item-grid">
                    <label className="calculator-field">
                      <span>Room</span>
                      <input
                        value={item.room_name ?? ""}
                        onChange={(event) =>
                          setProposal((current: any) => ({
                            ...current,
                            items: current.items.map((candidate: any) =>
                              candidate.proposal_item_id === item.proposal_item_id
                                ? { ...candidate, room_name: event.target.value }
                                : candidate,
                            ),
                          }))
                        }
                      />
                    </label>

                    <label className="calculator-field">
                      <span>Zone</span>
                      <input
                        value={item.zone_name ?? ""}
                        onChange={(event) =>
                          setProposal((current: any) => ({
                            ...current,
                            items: current.items.map((candidate: any) =>
                              candidate.proposal_item_id === item.proposal_item_id
                                ? { ...candidate, zone_name: event.target.value }
                                : candidate,
                            ),
                          }))
                        }
                      />
                    </label>

                    <label className="calculator-field">
                      <span>Title RU</span>
                      <input
                        value={item.title_ru ?? ""}
                        onChange={(event) =>
                          setProposal((current: any) => ({
                            ...current,
                            items: current.items.map((candidate: any) =>
                              candidate.proposal_item_id === item.proposal_item_id
                                ? { ...candidate, title_ru: event.target.value }
                                : candidate,
                            ),
                          }))
                        }
                      />
                    </label>

                    <label className="calculator-field">
                      <span>Title EN</span>
                      <input
                        value={item.title_en ?? ""}
                        onChange={(event) =>
                          setProposal((current: any) => ({
                            ...current,
                            items: current.items.map((candidate: any) =>
                              candidate.proposal_item_id === item.proposal_item_id
                                ? { ...candidate, title_en: event.target.value }
                                : candidate,
                            ),
                          }))
                        }
                      />
                    </label>

                    <label className="calculator-field">
                      <span>Price</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.line_price}
                        onChange={(event) =>
                          setProposal((current: any) => ({
                            ...current,
                            items: current.items.map((candidate: any) =>
                              candidate.proposal_item_id === item.proposal_item_id
                                ? { ...candidate, line_price: Number(event.target.value || 0) }
                                : candidate,
                            ),
                          }))
                        }
                      />
                    </label>

                    <label className="calculator-checkbox-field">
                      <input
                        type="checkbox"
                        checked={Boolean(item.is_optional)}
                        onChange={(event) =>
                          setProposal((current: any) => ({
                            ...current,
                            items: current.items.map((candidate: any) =>
                              candidate.proposal_item_id === item.proposal_item_id
                                ? { ...candidate, is_optional: event.target.checked }
                                : candidate,
                            ),
                          }))
                        }
                      />
                      <span>Optional item</span>
                    </label>

                    <label className="calculator-checkbox-field">
                      <input
                        type="checkbox"
                        checked={Boolean(item.client_selected)}
                        onChange={(event) =>
                          setProposal((current: any) => ({
                            ...current,
                            items: current.items.map((candidate: any) =>
                              candidate.proposal_item_id === item.proposal_item_id
                                ? { ...candidate, client_selected: event.target.checked }
                                : candidate,
                            ),
                          }))
                        }
                      />
                      <span>Selected by default</span>
                    </label>
                  </div>

                  <div className="proposal-item-actions">
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() => saveItem(item)}
                      disabled={saving || isMutationLocked}
                    >
                      Сохранить строку
                    </button>
                    <div className="row-meta">
                      {item.measurement?.sqft ? `${item.measurement.sqft} sqft` : item.unit_label ?? "manual line"}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="surface">
          <h3 className="surface-title">Добавить service card</h3>
          <p className="surface-subtitle">
            Здесь proposal builder использует ту же reference-driven логику, что и менеджерский калькулятор.
          </p>

          <div className="proposal-item-grid">
            <label className="calculator-field">
              <span>Room</span>
              <input
                value={newItemMeta.room_name}
                onChange={(event) => setNewItemMeta((current) => ({ ...current, room_name: event.target.value }))}
              />
            </label>

            <label className="calculator-field">
              <span>Zone</span>
              <input
                value={newItemMeta.zone_name}
                onChange={(event) => setNewItemMeta((current) => ({ ...current, zone_name: event.target.value }))}
              />
            </label>

            <label className="calculator-field">
              <span>Window ID</span>
              <input
                value={newItemMeta.window_id}
                onChange={(event) => setNewItemMeta((current) => ({ ...current, window_id: event.target.value }))}
              />
            </label>

            <label className="calculator-checkbox-field">
              <input
                type="checkbox"
                checked={newItemMeta.is_optional}
                onChange={(event) => setNewItemMeta((current) => ({ ...current, is_optional: event.target.checked }))}
              />
              <span>Optional service</span>
            </label>
          </div>

          <div className="calculator-card">
            <div className="calculator-card-head">
              <div>
                <div className="row-title">Service Constructor</div>
                <div className="row-meta">Dropdown service type, dynamic fields, addons rows и live total.</div>
              </div>
              <div className="chip chip-accent">{formatCurrency(newCardLine.line_total)}</div>
            </div>

            <div className="calculator-grid">
              <label className="calculator-field">
                <span>Категория услуги</span>
                <select
                  value={newCard.service_type_id ?? ""}
                  onChange={(event) =>
                    setNewCard((current) =>
                      createCardForServiceType(
                        calculatorBootstrap,
                        event.target.value || null,
                        current.id,
                      ),
                    )
                  }
                >
                  <option value="">Выберите услугу</option>
                  {calculatorBootstrap.service_types.map((serviceType) => (
                    <option key={serviceType.service_type_id} value={serviceType.service_type_id}>
                      {serviceType.name_ru}
                    </option>
                  ))}
                </select>
              </label>

              <label className="calculator-field">
                <span>Бренд</span>
                <select
                  value={newCard.selected_brand_code ?? ""}
                  onChange={(event) =>
                    setNewCard((current) => ({
                      ...current,
                      selected_brand_code: event.target.value || null,
                      film_id: null,
                    }))
                  }
                >
                  <option value="">Выберите бренд</option>
                  {getBrandOptions(calculatorBootstrap, newCard).map((brand) => (
                    <option key={brand.value} value={brand.value}>
                      {brand.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="calculator-field">
                <span>Модель</span>
                <select
                  value={newCard.film_id ?? ""}
                  onChange={(event) =>
                    setNewCard((current) => {
                      const selectedFilm =
                        calculatorBootstrap.film_catalog.find((film) => film.film_id === event.target.value) ?? null;

                      return {
                        ...current,
                        film_id: event.target.value || null,
                        dynamic_fields: {
                          ...current.dynamic_fields,
                          thickness: selectedFilm?.thickness ?? current.dynamic_fields.thickness ?? null,
                        },
                      };
                    })
                  }
                >
                  <option value="">Выберите модель</option>
                  {getFilmOptions(calculatorBootstrap, newCard).map((film) => (
                    <option key={film.film_id} value={film.film_id}>
                      {film.brand_name_ru} {film.model_name_ru}
                    </option>
                  ))}
                </select>
              </label>

              {getServiceFields(
                calculatorBootstrap.service_field_config,
                calculatorBootstrap.service_types,
                newCard.service_type_id,
              ).map((field) => {
                if (field.field_key === "category" || field.field_key === "brand" || field.field_key === "model") {
                  return null;
                }

                if (field.input_type === "checkbox") {
                  return (
                    <label key={field.service_field_config_id} className="calculator-checkbox-field">
                      <input
                        type="checkbox"
                        checked={Boolean(newCard.dynamic_fields[field.field_key])}
                        onChange={(event) =>
                          setNewCard((current) => ({
                            ...current,
                            dynamic_fields: {
                              ...current.dynamic_fields,
                              [field.field_key]: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span>{field.field_label_ru}</span>
                    </label>
                  );
                }

                if (field.input_type === "dropdown" && field.default_value?.options) {
                  return (
                    <label key={field.service_field_config_id} className="calculator-field">
                      <span>{field.field_label_ru}</span>
                      <select
                        value={String(newCard.dynamic_fields[field.field_key] ?? "")}
                        onChange={(event) =>
                          setNewCard((current) => ({
                            ...current,
                            dynamic_fields: {
                              ...current.dynamic_fields,
                              [field.field_key]: event.target.value || null,
                            },
                          }))
                        }
                      >
                        <option value="">Выберите значение</option>
                        {field.default_value.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label_ru}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }

                return (
                  <label key={field.service_field_config_id} className="calculator-field">
                    <span>{field.field_label_ru}</span>
                    <input
                      type={field.input_type === "number" ? "number" : "text"}
                      step={field.data_type === "decimal" ? "0.01" : "1"}
                      value={String(newCard.dynamic_fields[field.field_key] ?? "")}
                      onChange={(event) =>
                        setNewCard((current) => ({
                          ...current,
                          dynamic_fields: {
                            ...current.dynamic_fields,
                            [field.field_key]:
                              field.input_type === "number"
                                ? Number(event.target.value || 0)
                                : event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                );
              })}
            </div>

            <label className="calculator-notes">
              <span>Описание / Notes</span>
              <textarea
                value={newCard.notes}
                onChange={(event) => setNewCard((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            <div className="calculator-addon-band">
              <div className="calculator-addon-header">
                <div className="row-title">Допуслуги</div>
                <button
                  type="button"
                  className="soft-button"
                  disabled={
                    getServiceAddons(calculatorBootstrap.service_addons, newCard.service_type_id).filter(
                      (candidate) =>
                        !newCard.addons.some((selectedAddon) => selectedAddon.service_addon_id === candidate.service_addon_id),
                    ).length === 0
                  }
                  onClick={() => {
                    const availableAddons = getServiceAddons(calculatorBootstrap.service_addons, newCard.service_type_id);
                    const nextAddon = availableAddons.find(
                      (candidate) =>
                        !newCard.addons.some((selectedAddon) => selectedAddon.service_addon_id === candidate.service_addon_id),
                    );

                    if (!nextAddon) {
                      return;
                    }

                    setNewCard((current) => ({
                      ...current,
                      addons: [
                        ...current.addons,
                        createAddonSelection(nextAddon, parseNumber(current.dynamic_fields.sqft)),
                      ],
                    }));
                  }}
                >
                  Добавить допуслугу
                </button>
              </div>

              {newCard.addons.length === 0 ? (
                <div className="row-meta">Выберите нужные addons из dropdown. Washing / Removal / Silicone считаются по sqft.</div>
              ) : (
                <div className="calculator-addon-list">
                  {newCard.addons.map((selectedAddon) => {
                    const referenceAddon =
                      getServiceAddonById(calculatorBootstrap.service_addons, selectedAddon.service_addon_id) ?? null;
                    const availableAddons = getServiceAddons(calculatorBootstrap.service_addons, newCard.service_type_id)
                      .filter(
                        (candidate) =>
                          candidate.service_addon_id === selectedAddon.service_addon_id ||
                          !newCard.addons.some((item) => item.service_addon_id === candidate.service_addon_id),
                      );

                    return (
                      <div key={selectedAddon.id} className="calculator-addon-row-selected">
                        <div className="calculator-addon-grid">
                          <label className="calculator-field">
                            <span>Допуслуга</span>
                            <select
                              value={selectedAddon.service_addon_id ?? ""}
                              onChange={(event) => {
                                const nextAddon =
                                  getServiceAddonById(calculatorBootstrap.service_addons, event.target.value || null) ?? null;

                                setNewCard((current) => ({
                                  ...current,
                                  addons: current.addons.map((item) =>
                                    item.id === selectedAddon.id
                                      ? createAddonSelection(nextAddon, parseNumber(current.dynamic_fields.sqft), item.id)
                                      : item,
                                  ),
                                }));
                              }}
                            >
                              <option value="">Выберите addon</option>
                              {availableAddons.map((addon) => (
                                <option key={addon.service_addon_id} value={addon.service_addon_id}>
                                  {addon.name_ru}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="calculator-field">
                            <span>{referenceAddon?.unit_type === "sqft" ? "Sqft" : "Количество"}</span>
                            <input
                              type="number"
                              step="0.01"
                              value={String(selectedAddon.quantity ?? "")}
                              onChange={(event) =>
                                setNewCard((current) => ({
                                  ...current,
                                  addons: current.addons.map((item) =>
                                    item.id === selectedAddon.id
                                      ? { ...item, quantity: Number(event.target.value || 0) }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </label>

                          <label className="calculator-field">
                            <span>Цена</span>
                            <input
                              type="number"
                              step="0.01"
                              value={String(
                                selectedAddon.unit_price_override ??
                                  referenceAddon?.default_price ??
                                  "",
                              )}
                              onChange={(event) =>
                                setNewCard((current) => ({
                                  ...current,
                                  addons: current.addons.map((item) =>
                                    item.id === selectedAddon.id
                                      ? { ...item, unit_price_override: Number(event.target.value || 0) }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </label>
                        </div>

                        {referenceAddon?.addon_code === "OTHER" && (
                          <label className="calculator-field calculator-addon-description">
                            <span>Что это за другое</span>
                            <input
                              value={selectedAddon.manual_label ?? ""}
                              onChange={(event) =>
                                setNewCard((current) => ({
                                  ...current,
                                  addons: current.addons.map((item) =>
                                    item.id === selectedAddon.id
                                      ? { ...item, manual_label: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </label>
                        )}

                        <div className="calculator-addon-side">
                          <div className="row-meta">
                            {referenceAddon?.unit_type === "fixed" ? "fixed" : referenceAddon?.unit_type ?? "addon"}
                          </div>
                          <button
                            type="button"
                            className="soft-button"
                            onClick={() =>
                              setNewCard((current) => ({
                                ...current,
                                addons: current.addons.filter((item) => item.id !== selectedAddon.id),
                              }))
                            }
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="proposal-builder-footer">
              <button type="button" className="accent-button" onClick={addItem} disabled={saving || isMutationLocked}>
                Добавить строку
              </button>
              <div className="row-meta">Line total: {formatCurrency(newCardLine.line_total)}</div>
            </div>
          </div>
        </section>
      </div>

      <aside className="proposal-sideband">
        <section className="surface proposal-summary-surface">
          <h3 className="surface-title">Proposal Summary</h3>
          <div className="calculator-total-stack">
            <div className="calculator-total-row">
              <span>Items</span>
              <strong>{proposal.items.length}</strong>
            </div>
            <div className="calculator-total-row">
              <span>Subtotal</span>
              <strong>{formatCurrency(proposal.subtotal_amount)}</strong>
            </div>
            <div className="calculator-total-row calculator-total-row-strong">
              <span>Selected total</span>
              <strong>{formatCurrency(proposal.selected_total_amount)}</strong>
            </div>
          </div>
          <div className="row-meta mono">{proposal.public_url}</div>
        </section>

        <section className="surface">
          <h3 className="surface-title">Sales Handoff</h3>
          <div className="inspector-list">
            <div className="inspector-item">
              <div className="row-title">Proposal</div>
              <div className="row-meta">{proposal.status}</div>
            </div>
            <div className="inspector-item">
              <div className="row-title">Deposit</div>
              <div className="row-meta">
                {proposal.deposit
                  ? `${proposal.deposit.status} · ${formatCurrency(proposal.deposit.amount)}`
                  : "еще не создан"}
              </div>
            </div>
            <div className="inspector-item">
              <div className="row-title">Project</div>
              <div className="row-meta">
                {proposal.project ? `${proposal.project.project_code ?? proposal.project.project_id}` : "еще не создан"}
              </div>
            </div>
          </div>
        </section>

        <section className="surface">
          <h3 className="surface-title">Agreement</h3>
          {proposal.agreement ? (
            <div className="inspector-list">
              <div className="inspector-item">
                <div className="row-title">{proposal.agreement.signer_name}</div>
                <div className="row-meta">{proposal.agreement.signer_email}</div>
                <div className="row-meta">{proposal.agreement.status}</div>
              </div>
            </div>
          ) : (
            <div className="empty-state">Agreement пока не подписан.</div>
          )}
        </section>

        <section className="surface">
          <h3 className="surface-title">Timeline</h3>
          <div className="list-stack">
            {proposal.events.map((event: any) => (
              <div key={event.proposal_event_id} className="inspector-item">
                <div className="row-title">{event.message}</div>
                <div className="row-meta">
                  {event.actor_user?.full_name ?? event.actor_type} ·{" "}
                  {new Date(event.created_at).toLocaleString("ru-RU")}
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
