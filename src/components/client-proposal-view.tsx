"use client";

import { useState } from "react";

type ClientProposalViewProps = {
  initialProposal: any;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not specified";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not specified";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

async function parseProposal(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: {
          proposal?: any;
        };
        errors?: Array<{ message?: string }>;
      }
    | null;

  if (!response.ok || !payload?.data?.proposal) {
    throw new Error(payload?.errors?.[0]?.message ?? "Request failed.");
  }

  return payload.data.proposal;
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

/**
 * Клиент компании находится в США и читает документ на английском.
 *
 * Позиции приходят из старой системы, где размеры записаны в
 * миллиметрах, а названия проёмов по-русски: «Окно 1 · 1016 × 1778».
 * Американский клиент не понимает ни того, ни другого — в договоре на
 * несколько тысяч долларов это выглядит как чужой документ.
 *
 * Переводим при показе, не трогая данные: перевод в базе потребовал бы
 * переноса всех прежних предложений и сломал бы уже отправленные.
 */
const MM_PER_INCH = 25.4;

function millimetresToInches(value: number) {
  const inches = value / MM_PER_INCH;
  const rounded = Math.round(inches * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Характеристики плёнки для клиента.
 *
 * Показываются только заполненные: у собственной линейки MAGNITRONIC
 * PRIME есть реальные замеры, у чужих брендов данных может не быть.
 * Пустое поле честнее выдуманного — раньше система угадывала VLT по
 * цифре в названии и отправляла догадку в документ, по которому
 * клиент платит.
 */
/**
 * Описание услуги по направлению.
 *
 * Клиент принимает решение на десятки тысяч, видя только строку
 * «Window 1 — Titan Prime, $311». Он не знает, что именно делают,
 * сколько это занимает и что получится в итоге.
 *
 * Тексты постоянные и одинаковы для всех предложений одного
 * направления, поэтому живут в коде, а не пишутся менеджером заново.
 */
const SERVICE_INTROS: Record<string, { title: string; body: string; points: string[] }> = {
  solar: {
    title: "Solar control film",
    body:
      "A multi-layer film applied to the inside of your existing glass. It reflects heat and blocks ultraviolet light while keeping the view clear.",
    points: [
      "Rooms stay cooler in the afternoon, air conditioning runs less",
      "Blocks 99% of UV — floors, art and furniture stop fading",
      "Glass stays clear: no mirrored look unless you choose one",
      "Installed from inside, no scaffolding, no mess",
    ],
  },
  protective: {
    title: "Safety & security film",
    body:
      "A thick laminate bonded to the glass. On impact the glass still breaks, but the fragments stay attached to the film instead of falling.",
    points: [
      "Holds broken glass in place — protects people below",
      "Slows down forced entry through the window",
      "Sealed to the frame for full-perimeter strength",
      "Invisible once installed",
    ],
  },
  smart: {
    title: "Smart switchable film",
    body:
      "A film that turns from clear to opaque with electricity. Privacy on demand, without blinds or curtains.",
    points: [
      "Clear to private in under a second",
      "Control by switch, remote or phone",
      "Doubles as a projection surface when opaque",
      "Installed in three visits: wiring, film, connection and handover",
    ],
  },
  decorative: {
    title: "Decorative film",
    body:
      "Patterned or frosted film that changes how glass looks and how much is seen through it, without replacing the glass.",
    points: [
      "Frosted, patterned, gradient or custom-cut designs",
      "Adds privacy while keeping natural light",
      "Far cheaper than replacing glass with textured panels",
      "Reversible — can be changed later",
    ],
  },
};

function serviceIntroFor(items: any[]) {
  for (const item of items || []) {
    const raw = `${item?.film?.category_name ?? ""} ${item?.service_type?.name ?? ""}`.toLowerCase();
    if (raw.includes("smart")) return SERVICE_INTROS.smart;
    if (raw.includes("safety") || raw.includes("security") || raw.includes("protect")) return SERVICE_INTROS.protective;
    if (raw.includes("decor")) return SERVICE_INTROS.decorative;
    if (raw.includes("solar") || raw.includes("sun")) return SERVICE_INTROS.solar;
  }
  return null;
}

/**
 * Плёнки, встречающиеся в предложении, с их характеристиками —
 * для отдельного технического блока. Одна плёнка на десять окон
 * показывается один раз, а не десять.
 */
function uniqueFilmsWithSpecs(items: any[]) {
  const seen = new Map<string, any>();
  for (const item of items || []) {
    const film = item?.film;
    if (!film?.film_id) continue;
    if (seen.has(film.film_id)) continue;
    if (!filmSpecChips(film).length) continue;
    seen.set(film.film_id, film);
  }
  return [...seen.values()];
}

function filmSpecChips(film: any): string[] {
  if (!film) return [];
  const chips: string[] = [];
  if (film.vlt_percent != null) chips.push(`Visible light ${film.vlt_percent}%`);
  if (film.tser_percent != null) chips.push(`Heat rejected ${film.tser_percent}%`);
  if (film.uv_rejection_percent != null) chips.push(`UV blocked ${film.uv_rejection_percent}%`);
  if (film.ir_rejection_percent != null) chips.push(`Infrared blocked ${film.ir_rejection_percent}%`);
  if (film.thickness) chips.push(String(film.thickness));
  return chips;
}

function localizeItemText(text: unknown): string {
  if (typeof text !== "string" || !text.trim()) {
    // Возвращаемый тип объявлен явно: при strict вывод из `text ?? ""`
    // давал {} вместо string, и разметка отказывалась это принимать.
    return "";
  }

  let result = text;

  // «1016 × 1778» → «40 × 70 in». Размеры меньше 50 считаем уже
  // дюймами: окно шириной 30 мм не существует, а 30 дюймов обычно.
  result = result.replace(
    /(\d{2,5})(?:[.,]\d+)?\s*[×x]\s*(\d{2,5})(?:[.,]\d+)?(?!\s*(?:in|")\b)/gi,
    (match, rawWidth: string, rawHeight: string) => {
      const width = Number(rawWidth);
      const height = Number(rawHeight);

      if (!Number.isFinite(width) || !Number.isFinite(height)) return match;
      if (width < 50 || height < 50) return match;

      return `${millimetresToInches(width)} × ${millimetresToInches(height)} in`;
    },
  );

  // Граница слова \b в JavaScript опирается на латиницу, поэтому с
  // кириллицей не срабатывает: /\bОкно\b/ не находит «Окно».
  // Используем проверку на соседние буквы любого алфавита.
  const words: Array<[RegExp, string]> = [
    [/(?<!\p{L})Окно(?!\p{L})/gu, "Window"],
    [/(?<!\p{L})Дверь(?!\p{L})/gu, "Door"],
    [/(?<!\p{L})Перегородка(?!\p{L})/gu, "Partition"],
    [/(?<!\p{L})Витрина(?!\p{L})/gu, "Storefront"],
    [/(?<!\p{L})шт\.?(?!\p{L})/gu, "pcs"],
  ];

  for (const [pattern, replacement] of words) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

function getDynamicFieldSummary(item: any) {
  const fields = item?.dynamic_fields;

  if (!fields || typeof fields !== "object") {
    return [];
  }

  const record = fields as Record<string, unknown>;
  const entries = [
    record.sqft ? `${parseNumber(record.sqft)} sqft` : null,
    record.zones_qty ? `${parseNumber(record.zones_qty)} zones` : null,
    record.blocks_qty ? `${parseNumber(record.blocks_qty)} blocks` : null,
    record.windows_qty ? `${parseNumber(record.windows_qty)} windows` : null,
    typeof record.block_type === "string" && record.block_type.trim() ? `Block type: ${record.block_type}` : null,
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
        (typeof record.name_en === "string" && record.name_en.trim()) ||
        (typeof record.addon_code === "string" && record.addon_code.trim()) ||
        "Add-on";
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

export function ClientProposalView({ initialProposal }: ClientProposalViewProps) {
  const [proposal, setProposal] = useState(initialProposal);
  const [message, setMessage] = useState("Review the services below and keep only what you want to approve.");
  const [saving, setSaving] = useState(false);
  const [agreement, setAgreement] = useState({
    signer_name: proposal.agreement?.signer_name ?? "",
    signer_email: proposal.agreement?.signer_email ?? proposal.client?.email ?? "",
    signer_title: proposal.agreement?.signer_title ?? "",
    signature_text: proposal.agreement?.signer_name ?? "",
    client_notes: proposal.agreement?.client_notes ?? "",
    accepted_terms: Boolean(proposal.agreement?.accepted_terms),
  });

  const localSelectedTotal = proposal.items.reduce(
    (sum: number, item: any) => sum + (item.client_selected ? item.line_price : 0),
    0,
  );
  const printableItems = proposal.items.filter((item: any) => item.client_selected);

  async function saveSelection() {
    setSaving(true);
    setMessage("Saving your selection...");

    try {
      const updated = await parseProposal(
        await fetch(`/api/public/proposals/${proposal.access_token ?? ""}/selection`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: proposal.items.map((item: any) => ({
              proposal_item_id: item.proposal_item_id,
              client_selected: item.client_selected,
            })),
            client_message: proposal.client_message,
          }),
        }),
      );

      setProposal((current: any) => ({ ...updated, access_token: current.access_token }));
      setMessage("Your selection has been updated.");
      return updated;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your selection.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function signAgreement() {
    setSaving(true);
    setMessage("Signing agreement...");

    try {
      await saveSelection();

      const updated = await parseProposal(
        await fetch(`/api/public/proposals/${proposal.access_token ?? ""}/agreement`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(agreement),
        }),
      );

      setProposal((current: any) => ({ ...updated, access_token: current.access_token }));
      setMessage("Agreement signed successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign agreement.");
    } finally {
      setSaving(false);
    }
  }

  const isLocked = proposal.status === "agreement_signed" || proposal.status === "approved";
  const serviceIntro = serviceIntroFor(proposal.items);
  const filmsWithSpecs = uniqueFilmsWithSpecs(proposal.items);

  return (
    <div className="client-proposal-shell">
      <article className="proposal-print-document" aria-label="Printable ROLANPRO proposal">
        <header className="proposal-print-header">
          <div className="proposal-print-brand">
            <span className="proposal-print-brand-mark">R</span>
            <span>
              <strong>ROLANPRO</strong>
              <small>WINDOW FILM SOLUTIONS</small>
            </span>
          </div>
          <div className="proposal-print-meta">
            <strong>{proposal.proposal_code ?? "Proposal"}</strong>
            <span>Prepared {formatDate(proposal.created_at)}</span>
            <span>Valid through {formatDate(proposal.expires_at)}</span>
          </div>
        </header>

        <section className="proposal-print-intro">
          <div>
            <div className="proposal-print-kicker">Project proposal</div>
            <h1>{proposal.title}</h1>
            <p>
              A clear scope of selected services, materials, and project pricing prepared for your property.
            </p>
          </div>
          <div className="proposal-print-client">
            <span>Prepared for</span>
            <strong>{proposal.client?.name ?? "Client"}</strong>
            {proposal.client?.service_address ? <p>{proposal.client.service_address}</p> : null}
            {proposal.client?.email ? <p>{proposal.client.email}</p> : null}
          </div>
        </section>

        <section className="proposal-print-scope">
          <div className="proposal-print-section-heading">
            <div>
              <span>Selected scope</span>
              <h2>Services included in this proposal</h2>
            </div>
            <strong>{printableItems.length} line{printableItems.length === 1 ? "" : "s"}</strong>
          </div>

          <div className="proposal-print-items">
            {printableItems.map((item: any, index: number) => {
              const fieldSummary = getDynamicFieldSummary(item);
              const addonSummary = getAddonSummary(item.addons_snapshot);

              return (
                <section key={item.proposal_item_id} className="proposal-print-item">
                  <div className="proposal-print-item-number">{String(index + 1).padStart(2, "0")}</div>
                  <div className="proposal-print-item-copy">
                    <div className="proposal-print-item-heading">
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.room_name ?? "General"} - {item.service_type?.name ?? "Service"}</p>
                      </div>
                      <strong>{formatCurrency(item.line_price)}</strong>
                    </div>
                    <p className="proposal-print-description">
                      {item.film
                        ? `${item.film.brand_name} ${item.film.model_name} - ${item.film.category_name}`
                        : item.description ?? "Custom project service"}
                    </p>
                    {filmSpecChips(item.film).length > 0 && (
                      <p className="proposal-print-description">
                        {filmSpecChips(item.film).join(" · ")}
                      </p>
                    )}
                    {fieldSummary.length || addonSummary.length ? (
                      <div className="proposal-print-facts">
                        {[...fieldSummary, ...addonSummary].map((summary) => (
                          <span key={summary}>{summary}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <section className="proposal-print-closing">
          <div className="proposal-print-note">
            <span>Project note</span>
            <p>{proposal.client_message || "Thank you for the opportunity to prepare this proposal."}</p>
          </div>
          <div className="proposal-print-total">
            <span>Selected project total</span>
            <strong>{formatCurrency(localSelectedTotal)}</strong>
            <small>Final scope is based on the selected services above.</small>
          </div>
        </section>

        <section className="proposal-print-signatures">
          <div>
            <span>{proposal.agreement?.signer_name || "Client approval"}</span>
            <small>Signature / date</small>
          </div>
          <div>
            <span>ROLANPRO representative</span>
            <small>Signature / date</small>
          </div>
        </section>

        <footer className="proposal-print-footer">
          <strong>ROLANPRO</strong>
          <span>Professional window film solutions - Los Angeles</span>
        </footer>
      </article>

      <section className="client-proposal-hero">
        <div>
          <div className="landing-kicker">ROLANPRO Proposal</div>
          <h1 className="client-proposal-title">{proposal.title}</h1>
          <p className="landing-text">
            Review each service line, keep what you want, remove what you do not need, and sign the
            agreement when ready.
          </p>
          <button type="button" className="secondary-button proposal-print-trigger" onClick={() => window.print()}>
            Download polished PDF
          </button>
        </div>

        <div className="client-proposal-summary">
          <div className="client-summary-row">
            <span>Proposal Total</span>
            <strong>{formatCurrency(proposal.subtotal_amount)}</strong>
          </div>
          <div className="client-summary-row client-summary-row-strong">
            <span>Selected Total</span>
            <strong>{formatCurrency(localSelectedTotal)}</strong>
          </div>
        </div>
      </section>

      <section className="client-proposal-grid">
        <div className="client-proposal-band">
          <section className="surface">
            <h2 className="surface-title">Service Lines</h2>
            <p className="surface-subtitle">
              Only approved and selected items will move into the final project.
            </p>

            <div className="client-item-list">
              {proposal.items.map((item: any) => {
                const fieldSummary = getDynamicFieldSummary(item);
                const addonSummary = getAddonSummary(item.addons_snapshot);

                return (
                  <article key={item.proposal_item_id} className="client-item-card">
                    <div className="client-item-top">
                      <div>
                        <div className="row-title">{localizeItemText(item.title)}</div>
                        <div className="row-meta">
                          {item.room_name ?? "General"} · {item.service_type?.name ?? "Service"}
                        </div>
                      </div>
                      <div className="chip chip-accent">{formatCurrency(item.line_price)}</div>
                    </div>

                    <div className="row-meta">
                      {item.film
                        ? `${item.film.brand_name} ${item.film.model_name} · ${item.film.category_name}`
                        : localizeItemText(item.description) || "Custom line item"}
                    </div>

                    {filmSpecChips(item.film).length > 0 && (
                      <div className="proposal-detail-chips">
                        {filmSpecChips(item.film).map((spec) => (
                          <span key={spec} className="chip chip-spec">
                            {spec}
                          </span>
                        ))}
                      </div>
                    )}

                    {fieldSummary.length > 0 && (
                      <div className="proposal-detail-chips">
                        {fieldSummary.map((summary) => (
                          <span key={summary} className="chip">
                            {summary}
                          </span>
                        ))}
                      </div>
                    )}

                    {addonSummary.length > 0 && (
                      <div className="proposal-detail-list">
                        {addonSummary.map((summary) => (
                          <div key={summary} className="row-meta">
                            {summary}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Раньше здесь при отсутствии площади печаталось unit_label —
                        служебное «window». Клиенту оно ничего не говорит, а в
                        документе на десятки тысяч выглядит как недоделка. */}
                    {item.measurement?.sqft ? (
                      <div className="row-meta">{item.measurement.sqft} sqft</div>
                    ) : null}

                    <label className="client-item-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(item.client_selected)}
                        disabled={isLocked || saving}
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
                      <span>{item.is_optional ? "Select optional item" : "Keep this service"}</span>
                    </label>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Технический блок: характеристики плёнок, встречающихся в
              предложении. Одна плёнка на десять окон показывается один
              раз, а не под каждой позицией. Плёнки без заполненных
              характеристик сюда не попадают — пустой блок хуже, чем
              его отсутствие. */}
          {filmsWithSpecs.length > 0 && (
            <section className="surface">
              <h2 className="surface-title">Technical specification</h2>
              <p className="surface-subtitle">
                Measured performance of the films selected for your project.
              </p>
              <div className="client-item-list">
                {filmsWithSpecs.map((film: any) => (
                  <div key={film.film_id} className="client-item-card">
                    <div className="row-title">
                      {film.brand_name} {film.model_name}
                    </div>
                    <div className="row-meta">{film.category_name}</div>
                    <div className="proposal-detail-chips">
                      {filmSpecChips(film).map((spec) => (
                        <span key={spec} className="chip">
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="landing-text">
                Visible light is how much daylight passes through. Heat rejected is the
                share of solar energy kept out of the room. UV blocking protects floors,
                furniture and artwork from fading.
              </p>
            </section>
          )}

          <section className="surface">
            <h2 className="surface-title">Questions / Notes</h2>
            <label className="calculator-notes">
              <span>Your message</span>
              <textarea
                value={proposal.client_message ?? ""}
                disabled={isLocked || saving}
                onChange={(event) =>
                  setProposal((current: any) => ({ ...current, client_message: event.target.value }))
                }
              />
            </label>

            <div className="proposal-builder-footer">
              <button type="button" className="accent-button" onClick={saveSelection} disabled={isLocked || saving}>
                Update Selection
              </button>
              <div className="row-meta">{message}</div>
            </div>
          </section>
        </div>

        <aside className="client-proposal-side">
          <section className="surface">
            <h2 className="surface-title">Agreement</h2>
            <p className="surface-subtitle">
              Signing confirms the selected services and authorizes the project to move forward.
            </p>

            <div className="proposal-item-grid">
              <label className="calculator-field">
                <span>Full Name</span>
                <input
                  value={agreement.signer_name}
                  disabled={isLocked || saving}
                  onChange={(event) => setAgreement((current) => ({ ...current, signer_name: event.target.value }))}
                />
              </label>

              <label className="calculator-field">
                <span>Email</span>
                <input
                  value={agreement.signer_email}
                  disabled={isLocked || saving}
                  onChange={(event) => setAgreement((current) => ({ ...current, signer_email: event.target.value }))}
                />
              </label>

              <label className="calculator-field">
                <span>Title</span>
                <input
                  value={agreement.signer_title}
                  disabled={isLocked || saving}
                  onChange={(event) => setAgreement((current) => ({ ...current, signer_title: event.target.value }))}
                />
              </label>

              <label className="calculator-field">
                <span>Type your full name as signature</span>
                <input
                  value={agreement.signature_text}
                  disabled={isLocked || saving}
                  onChange={(event) => setAgreement((current) => ({ ...current, signature_text: event.target.value }))}
                />
              </label>
            </div>

            <label className="calculator-notes">
              <span>Client Notes</span>
              {/* rows задан явно: без него браузер тянул поле вниз, и блок
                  подтверждения согласия наезжал на него поверх. В остальных
                  местах системы у этого класса rows тоже проставлен. */}
              <textarea
                rows={4}
                value={agreement.client_notes}
                disabled={isLocked || saving}
                onChange={(event) => setAgreement((current) => ({ ...current, client_notes: event.target.value }))}
              />
            </label>

            <label className="calculator-checkbox-field">
              <input
                type="checkbox"
                checked={agreement.accepted_terms}
                disabled={isLocked || saving}
                onChange={(event) =>
                  setAgreement((current) => ({ ...current, accepted_terms: event.target.checked }))
                }
              />
              <span>I confirm the selected services and agree to proceed.</span>
            </label>

            <div className="proposal-builder-footer">
              <button type="button" className="accent-button" onClick={signAgreement} disabled={isLocked || saving}>
                {isLocked ? "Agreement Signed" : "Sign Agreement"}
              </button>
            </div>
          </section>

        </aside>
      </section>
    </div>
  );
}
