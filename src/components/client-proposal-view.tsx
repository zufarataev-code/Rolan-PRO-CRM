"use client";

import { useState } from "react";

type ClientProposalViewProps = {
  initialProposal: any;
  language?: "en" | "ru";
  onAgreementSigned?: () => void;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined, language: "en" | "ru" = "en") {
  if (!value) {
    return language === "ru" ? "не указано" : "Not specified";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return language === "ru" ? "не указано" : "Not specified";
  }

  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
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

const SERVICE_INTROS_RU: typeof SERVICE_INTROS = {
  solar: {
    title: "Солнцезащитная плёнка",
    body: "Многослойная плёнка устанавливается на внутреннюю сторону существующего стекла. Она отражает тепло и блокирует ультрафиолет, сохраняя обзор.",
    points: [
      "В помещении прохладнее, кондиционер работает меньше",
      "Блокирует до 99% ультрафиолета и защищает интерьер от выцветания",
      "Стекло остаётся прозрачным, если не выбран зеркальный эффект",
      "Монтаж выполняется изнутри аккуратно и без строительного мусора",
    ],
  },
  protective: {
    title: "Защитная плёнка",
    body: "Толстый ламинирующий слой прочно соединяется со стеклом. При ударе стекло может треснуть, но осколки остаются на плёнке.",
    points: [
      "Удерживает разбитое стекло и защищает людей",
      "Замедляет проникновение через окно",
      "Может крепиться по периметру к раме для усиления",
      "После установки практически незаметна",
    ],
  },
  smart: {
    title: "Переключаемая smart-плёнка",
    body: "Плёнка меняет состояние с прозрачного на матовое при подаче электричества. Приватность по команде — без жалюзи и штор.",
    points: [
      "Переключение из прозрачного состояния в приватное менее чем за секунду",
      "Управление выключателем, пультом или телефоном",
      "В матовом состоянии может использоваться как проекционная поверхность",
      "Монтаж включает электрику, плёнку, подключение и сдачу системы",
    ],
  },
  decorative: {
    title: "Декоративная плёнка",
    body: "Матовая или узорчатая плёнка меняет внешний вид стекла и уровень приватности без замены самого стекла.",
    points: [
      "Матовые, узорчатые, градиентные и индивидуальные дизайны",
      "Больше приватности при сохранении естественного света",
      "Значительно дешевле замены стекла на декоративные панели",
      "Покрытие можно заменить в будущем",
    ],
  },
};

function serviceIntroFor(items: any[], language: "en" | "ru") {
  const intros = language === "ru" ? SERVICE_INTROS_RU : SERVICE_INTROS;
  for (const item of items || []) {
    const raw = `${item?.film?.category_name ?? ""} ${item?.service_type?.name ?? ""}`.toLowerCase();
    if (raw.includes("smart")) return intros.smart;
    if (raw.includes("safety") || raw.includes("security") || raw.includes("protect")) return intros.protective;
    if (raw.includes("decor")) return intros.decorative;
    if (raw.includes("solar") || raw.includes("sun")) return intros.solar;
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

function filmSpecChips(film: any, language: "en" | "ru" = "en"): string[] {
  if (!film) return [];
  const chips: string[] = [];
  if (film.vlt_percent != null) chips.push(`${language === "ru" ? "Светопропускание" : "Visible light"} ${film.vlt_percent}%`);
  if (film.tser_percent != null) chips.push(`${language === "ru" ? "Отражение тепла" : "Heat rejected"} ${film.tser_percent}%`);
  if (film.uv_rejection_percent != null) chips.push(`${language === "ru" ? "Блокировка UV" : "UV blocked"} ${film.uv_rejection_percent}%`);
  if (film.ir_rejection_percent != null) chips.push(`${language === "ru" ? "Блокировка IR" : "Infrared blocked"} ${film.ir_rejection_percent}%`);
  if (film.thickness) chips.push(String(film.thickness));
  return chips;
}

function localizeItemText(text: unknown, language: "en" | "ru" = "en"): string {
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
  const words: Array<[RegExp, string]> = language === "ru"
    ? [
        [/(?<!\p{L})Window(?!\p{L})/giu, "Окно"],
        [/(?<!\p{L})Door(?!\p{L})/giu, "Дверь"],
        [/(?<!\p{L})Partition(?!\p{L})/giu, "Перегородка"],
        [/(?<!\p{L})Storefront(?!\p{L})/giu, "Витрина"],
        [/(?<!\p{L})pcs\.?(?!\p{L})/giu, "шт."],
      ]
    : [
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

/**
 * Сводка проекта для обложки: комнаты, окна, площадь.
 *
 * Премиальное КП в legacy показывало эти цифры сразу под именем клиента —
 * клиент видел объём работ до цены. Здесь они собираются из позиций:
 * площадь берётся из снимка замера, если он есть.
 */
function getProjectSummary(items: any[]) {
  const rooms = new Set<string>();
  let windows = 0;
  let area = 0;

  for (const item of items ?? []) {
    if (item.room_name) rooms.add(String(item.room_name));
    windows += Number(item.quantity) || 0;

    const sqft = Number(item?.measurement_snapshot?.sqft);
    if (Number.isFinite(sqft)) area += sqft;
  }

  return { rooms: rooms.size, windows, area };
}

/**
 * Позиции, сгруппированные по комнате, в порядке первого появления.
 * Клиент читает документ по комнатам своего дома, а не сплошным списком.
 */
function groupItemsByRoom(items: any[]) {
  const groups = new Map<string, any[]>();

  for (const item of items ?? []) {
    const room = item.room_name ? String(item.room_name) : "Project";
    if (!groups.has(room)) groups.set(room, []);
    groups.get(room)!.push(item);
  }

  return Array.from(groups, ([room, roomItems]) => ({ room, items: roomItems }));
}

function getDynamicFieldSummary(item: any, language: "en" | "ru" = "en") {
  const fields = item?.dynamic_fields;

  if (!fields || typeof fields !== "object") {
    return [];
  }

  const record = fields as Record<string, unknown>;
  const entries = [
    record.sqft ? `${parseNumber(record.sqft)} sqft` : null,
    record.zones_qty ? `${parseNumber(record.zones_qty)} ${language === "ru" ? "зон" : "zones"}` : null,
    record.blocks_qty ? `${parseNumber(record.blocks_qty)} ${language === "ru" ? "блоков" : "blocks"}` : null,
    record.windows_qty ? `${parseNumber(record.windows_qty)} ${language === "ru" ? "окон" : "windows"}` : null,
    typeof record.block_type === "string" && record.block_type.trim() ? `${language === "ru" ? "Тип блока" : "Block type"}: ${record.block_type}` : null,
    typeof record.thickness === "string" && record.thickness.trim() ? `${language === "ru" ? "Толщина" : "Thickness"}: ${record.thickness}` : null,
  ];

  return entries.filter((entry): entry is string => Boolean(entry));
}

function getMeasurementSummary(item: any, language: "en" | "ru" = "en") {
  const snapshot = item?.measurement_snapshot;
  if (!snapshot || typeof snapshot !== "object") return [];

  const width = parseNumber(snapshot.width);
  const height = parseNumber(snapshot.height);
  const sqft = parseNumber(snapshot.sqft);
  const facts = [
    width > 0 && height > 0 ? localizeItemText(`${width} × ${height}`, language) : null,
    sqft > 0 ? `${sqft.toFixed(1)} sqft` : null,
    snapshot.glass_type ? `${language === "ru" ? "Стекло" : "Glass"}: ${String(snapshot.glass_type)}` : null,
    snapshot.installation_side ? `${language === "ru" ? "Монтаж" : "Install"}: ${String(snapshot.installation_side)}` : null,
  ];

  return facts.filter((fact): fact is string => Boolean(fact));
}

function getAddonSummary(addonsSnapshot: unknown, language: "en" | "ru" = "en") {
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
        (language === "ru" ? "Дополнительная услуга" : "Add-on");
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

export function ClientProposalView({
  initialProposal,
  language = "en",
  onAgreementSigned,
}: ClientProposalViewProps) {
  const ru = language === "ru";
  const [proposal, setProposal] = useState(initialProposal);
  const [message, setMessage] = useState(
    ru
      ? "Проверьте услуги ниже и оставьте только то, что хотите согласовать."
      : "Review the services below and keep only what you want to approve.",
  );
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
  const selectedCount = printableItems.length;
  const projectSummary = getProjectSummary(proposal.items);
  const roomGroups = groupItemsByRoom(proposal.items);

  async function saveSelection() {
    setSaving(true);
    setMessage(ru ? "Сохраняем выбранные услуги..." : "Saving your selection...");

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
      setMessage(ru ? "Выбранные услуги обновлены." : "Your selection has been updated.");
      return updated;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (ru ? "Не удалось сохранить выбранные услуги." : "Could not save your selection."));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function signAgreement() {
    setSaving(true);
    setMessage(ru ? "Подписываем договор..." : "Signing agreement...");

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
      setMessage(ru ? "Договор успешно подписан. Теперь можно перейти к оплате." : "Agreement signed successfully. You can now continue to payment.");
      onAgreementSigned?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (ru ? "Не удалось подписать договор." : "Could not sign agreement."));
    } finally {
      setSaving(false);
    }
  }

  const isLocked = proposal.status === "agreement_signed" || proposal.status === "approved";
  const serviceIntro = serviceIntroFor(proposal.items, language);
  const filmsWithSpecs = uniqueFilmsWithSpecs(proposal.items);

  return (
    <div className="client-proposal-shell">
      <article className="proposal-print-document" aria-label="Printable ROLANPRO proposal">
        <header className="proposal-print-header">
          <div className="proposal-print-brand">
            <img src="/landing/rolan-logo.webp" alt="Rolan PRO" className="proposal-print-logo" />
          </div>
          <div className="proposal-print-meta">
            <strong>{proposal.proposal_code ?? (ru ? "Коммерческое предложение" : "Proposal")}</strong>
            <span>{ru ? "Подготовлено" : "Prepared"} {formatDate(proposal.created_at, language)}</span>
            <span>{ru ? "Действительно до" : "Valid through"} {formatDate(proposal.expires_at, language)}</span>
          </div>
        </header>

        <section className="proposal-print-intro">
          <div>
            <div className="proposal-print-kicker">{ru ? "Коммерческое предложение" : "Project proposal"}</div>
            <h1>{proposal.title}</h1>
            <p>
              {ru ? "Понятный состав выбранных услуг, материалов и стоимости проекта для вашего объекта." : "A clear scope of selected services, materials, and project pricing prepared for your property."}
            </p>
          </div>
          <div className="proposal-print-client">
            <span>{ru ? "Подготовлено для" : "Prepared for"}</span>
            <strong>{proposal.client?.name ?? (ru ? "Клиент" : "Client")}</strong>
            {proposal.client?.service_address ? <p>{proposal.client.service_address}</p> : null}
            {proposal.client?.email ? <p>{proposal.client.email}</p> : null}
          </div>
        </section>

        <section className="proposal-print-overview">
          <div><span>{ru ? "Помещения / зоны" : "Project areas"}</span><strong>{projectSummary.rooms || "—"}</strong></div>
          <div><span>{ru ? "Стеклянные элементы" : "Glass sections"}</span><strong>{projectSummary.windows || "—"}</strong></div>
          <div><span>{ru ? "Измеренная площадь" : "Measured area"}</span><strong>{projectSummary.area ? `${projectSummary.area.toFixed(1)} sqft` : (ru ? "Объём проекта" : "Project scope")}</strong></div>
          <div><span>{ru ? "Стоимость выбранных работ" : "Selected investment"}</span><strong>{formatCurrency(localSelectedTotal)}</strong></div>
        </section>

        {serviceIntro ? (
          <section className="proposal-print-solution">
            <div>
              <span>{ru ? "Рекомендуемое решение" : "Recommended solution"}</span>
              <h2>{serviceIntro.title}</h2>
              <p>{serviceIntro.body}</p>
            </div>
            <ul>{serviceIntro.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </section>
        ) : null}

        <section className="proposal-print-scope">
          <div className="proposal-print-section-heading">
            <div>
              <span>{ru ? "Выбранный объём" : "Selected scope"}</span>
              <h2>{ru ? "Услуги, включённые в это КП" : "Services included in this proposal"}</h2>
            </div>
            <strong>{printableItems.length} {ru ? "поз." : `line${printableItems.length === 1 ? "" : "s"}`}</strong>
          </div>

          <div className="proposal-print-items">
            {printableItems.map((item: any, index: number) => {
              const fieldSummary = [...new Set([...getMeasurementSummary(item, language), ...getDynamicFieldSummary(item, language)])];
              const addonSummary = getAddonSummary(item.addons_snapshot, language);
              const itemTitle = localizeItemText(ru ? item.title_ru || item.title : item.title_en || item.title, language);
              const itemDescription = localizeItemText(ru ? item.description_ru || item.description : item.description_en || item.description, language);
              const serviceName = ru ? item.service_type?.name_ru || item.service_type?.name : item.service_type?.name_en || item.service_type?.name;
              const filmName = item.film
                ? `${ru ? item.film.brand_name_ru || item.film.brand_name : item.film.brand_name_en || item.film.brand_name} ${ru ? item.film.model_name_ru || item.film.model_name : item.film.model_name_en || item.film.model_name} - ${ru ? item.film.category_name_ru || item.film.category_name : item.film.category_name_en || item.film.category_name}`
                : null;

              return (
                <section key={item.proposal_item_id} className="proposal-print-item">
                  <div className="proposal-print-item-number">{String(index + 1).padStart(2, "0")}</div>
                  <div className="proposal-print-item-copy">
                    <div className="proposal-print-item-heading">
                      <div>
                        <h3>{itemTitle}</h3>
                        <p>{localizeItemText(item.room_name ?? (ru ? "Общее" : "General"), language)} - {serviceName ?? (ru ? "Услуга" : "Service")}</p>
                      </div>
                      <strong>{formatCurrency(item.line_price)}</strong>
                    </div>
                    <p className="proposal-print-description">
                      {(filmName ?? itemDescription) || (ru ? "Индивидуальная услуга проекта" : "Custom project service")}
                    </p>
                    {filmSpecChips(item.film, language).length > 0 && (
                      <p className="proposal-print-description">
                        {filmSpecChips(item.film, language).join(" · ")}
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
            <span>{ru ? "Примечание к проекту" : "Project note"}</span>
            <p>{proposal.client_message || (ru ? "Благодарим за возможность подготовить это предложение." : "Thank you for the opportunity to prepare this proposal.")}</p>
          </div>
          <div className="proposal-print-total">
            <span>{ru ? "Итого по выбранным работам" : "Selected project total"}</span>
            <strong>{formatCurrency(localSelectedTotal)}</strong>
            <small>{ru ? "Окончательный объём определяется выбранными выше услугами." : "Final scope is based on the selected services above."}</small>
          </div>
        </section>

        <section className="proposal-print-signatures">
          <div>
            <span>{proposal.agreement?.signer_name || (ru ? "Согласование клиента" : "Client approval")}</span>
            <small>{ru ? "Подпись / дата" : "Signature / date"}</small>
          </div>
          <div>
            <span>{ru ? "Представитель Rolan PRO" : "ROLANPRO representative"}</span>
            <small>{ru ? "Подпись / дата" : "Signature / date"}</small>
          </div>
        </section>

        <footer className="proposal-print-footer">
          <strong>ROLANPRO</strong>
          <span>{ru ? "Профессиональные решения для остекления — Лос-Анджелес" : "Professional window film solutions - Los Angeles"}</span>
        </footer>
      </article>

      <header className="client-proposal-hero">
        <div className="proposal-hero-nav">
          <img src="/landing/rolan-logo.webp" alt="Rolan PRO" className="proposal-hero-logo" />
          <div className="proposal-hero-meta">
            <strong>{proposal.proposal_code ?? (ru ? "Коммерческое предложение" : "Project proposal")}</strong>
            <span>{ru ? "Действительно до" : "Valid through"} {formatDate(proposal.expires_at, language)}</span>
          </div>
        </div>

        <div className="proposal-hero-copy">
          <div className="landing-kicker">{ru ? "КП на установку плёнки подготовлено для" : "Window film proposal prepared for"}</div>
          <h1 className="client-proposal-title">{proposal.client?.name ?? proposal.title}</h1>
          <p className="client-proposal-address">{proposal.client?.service_address || (ru ? "Южная Калифорния" : "Southern California")}</p>
          <p className="landing-text">
            {ru
              ? "Индивидуальное решение на основе замера: материалы, объём монтажа и стоимость собраны в одном понятном документе."
              : "A measured, project-specific solution for your glass — materials, installation scope and investment presented in one clear document."}
          </p>
          <div className="proposal-hero-actions">
            <a href="#project-scope" className="proposal-primary-link">{ru ? "Проверить состав проекта" : "Review project scope"}</a>
            <a href="#proposal-payment" className="proposal-primary-link">{ru ? "Перейти к оплате" : "Go to payment"}</a>
            <button type="button" className="proposal-print-trigger" onClick={() => window.print()}>
              {ru ? "Скачать PDF" : "Download PDF"}
            </button>
          </div>
        </div>

        <div className="client-proposal-summary">
          <span>{ru ? "Стоимость выбранных работ" : "Your selected investment"}</span>
          <strong>{formatCurrency(localSelectedTotal)}</strong>
          <small>{selectedCount} {ru ? "выбранных позиций" : `selected service ${selectedCount === 1 ? "line" : "lines"}`}</small>
        </div>
      </header>

      <section className="proposal-overview-strip" aria-label="Project summary">
        <div><span>{ru ? "КП" : "Proposal"}</span><strong>{proposal.proposal_code ?? (ru ? "Подготовлено" : "Prepared")}</strong></div>
        <div><span>{ru ? "Помещения / зоны" : "Project areas"}</span><strong>{projectSummary.rooms || "—"}</strong></div>
        <div><span>{ru ? "Стеклянные элементы" : "Glass sections"}</span><strong>{projectSummary.windows || "—"}</strong></div>
        <div><span>{ru ? "Измеренная площадь" : "Measured area"}</span><strong>{projectSummary.area ? `${projectSummary.area.toFixed(1)} sqft` : "—"}</strong></div>
      </section>

      {serviceIntro ? (
        <section className="proposal-solution-section">
          <div className="proposal-section-label">01 / {ru ? "Рекомендуемое решение" : "Recommended solution"}</div>
          <div className="proposal-solution-copy">
            <h2>{serviceIntro.title}</h2>
            <p>{serviceIntro.body}</p>
          </div>
          <div className="proposal-benefit-list">
            {serviceIntro.points.map((point, index) => (
              <div key={point}><span>{String(index + 1).padStart(2, "0")}</span><p>{point}</p></div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="client-proposal-grid">
        <div className="client-proposal-band">
          <section className="surface proposal-scope-section" id="project-scope">
            <div className="proposal-section-label">02 / {ru ? "Объём по замеру" : "Measured scope"}</div>
            <h2 className="surface-title">{ru ? "Проект по помещениям" : "Your project, room by room"}</h2>
            <p className="surface-subtitle">
              {ru ? "Каждая позиция привязана к измеренному стеклу. Дополнительные услуги можно включить или убрать до подписания." : "Every line is tied to the measured glass. Optional services can be included or removed before signing."}
            </p>

            {roomGroups.map((group) => (
              <div key={group.room} className="client-room-group">
                <div className="client-room-head">
                  <h3 className="client-room-title">{localizeItemText(group.room, language)}</h3>
                  <span className="client-room-count">
                    {group.items.length} {ru ? "поз." : (group.items.length === 1 ? "line" : "lines")}
                  </span>
                </div>

            <div className="client-item-list">
              {group.items.map((item: any) => {
                const fieldSummary = [...new Set([...getMeasurementSummary(item, language), ...getDynamicFieldSummary(item, language)])];
                const addonSummary = getAddonSummary(item.addons_snapshot, language);
                const itemTitle = localizeItemText(ru ? item.title_ru || item.title : item.title_en || item.title, language);
                const itemDescription = localizeItemText(ru ? item.description_ru || item.description : item.description_en || item.description, language);
                const serviceName = ru ? item.service_type?.name_ru || item.service_type?.name : item.service_type?.name_en || item.service_type?.name;
                const filmName = item.film
                  ? `${ru ? item.film.brand_name_ru || item.film.brand_name : item.film.brand_name_en || item.film.brand_name} ${ru ? item.film.model_name_ru || item.film.model_name : item.film.model_name_en || item.film.model_name} · ${ru ? item.film.category_name_ru || item.film.category_name : item.film.category_name_en || item.film.category_name}`
                  : null;

                return (
                  <article key={item.proposal_item_id} className="client-item-card">
                    <div className="client-item-top">
                      <div>
                        <div className="row-title">{itemTitle}</div>
                        <div className="row-meta">
                          {localizeItemText(item.room_name ?? (ru ? "Общее" : "General"), language)} · {serviceName ?? (ru ? "Услуга" : "Service")}
                        </div>
                      </div>
                      <div className="chip chip-accent">{formatCurrency(item.line_price)}</div>
                    </div>

                    <div className="row-meta">
                      {(filmName ?? itemDescription) || (ru ? "Индивидуальная позиция" : "Custom line item")}
                    </div>

                    {filmSpecChips(item.film, language).length > 0 && (
                      <div className="proposal-detail-chips">
                        {filmSpecChips(item.film, language).map((spec) => (
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
                      <span>{item.is_optional ? (ru ? "Добавить дополнительную услугу" : "Select optional item") : (ru ? "Оставить эту услугу" : "Keep this service")}</span>
                    </label>
                  </article>
                );
              })}
            </div>
              </div>
            ))}
          </section>

          {/* Технический блок: характеристики плёнок, встречающихся в
              предложении. Одна плёнка на десять окон показывается один
              раз, а не под каждой позицией. Плёнки без заполненных
              характеристик сюда не попадают — пустой блок хуже, чем
              его отсутствие. */}
          {filmsWithSpecs.length > 0 && (
            <section className="surface">
              <h2 className="surface-title">{ru ? "Технические характеристики" : "Technical specification"}</h2>
              <p className="surface-subtitle">
                {ru ? "Измеренные характеристики плёнок, выбранных для проекта." : "Measured performance of the films selected for your project."}
              </p>
              <div className="client-item-list">
                {filmsWithSpecs.map((film: any) => (
                  <div key={film.film_id} className="client-item-card">
                    <div className="row-title">
                      {ru ? film.brand_name_ru || film.brand_name : film.brand_name_en || film.brand_name} {ru ? film.model_name_ru || film.model_name : film.model_name_en || film.model_name}
                    </div>
                    <div className="row-meta">{ru ? film.category_name_ru || film.category_name : film.category_name_en || film.category_name}</div>
                    <div className="proposal-detail-chips">
                      {filmSpecChips(film, language).map((spec) => (
                        <span key={spec} className="chip">
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="landing-text">
                {ru
                  ? "Светопропускание показывает, сколько дневного света проходит через стекло. Отражение тепла — какую долю солнечной энергии плёнка не пускает в помещение. Блокировка UV защищает полы, мебель и предметы интерьера от выцветания."
                  : "Visible light is how much daylight passes through. Heat rejected is the share of solar energy kept out of the room. UV blocking protects floors, furniture and artwork from fading."}
              </p>
            </section>
          )}

          <section className="proposal-assurance-section">
            <div className="proposal-section-label">03 / {ru ? "Порядок выполнения" : "Delivery standard"}</div>
            <h2>{ru ? "Что происходит после согласования" : "What happens after approval"}</h2>
            <div className="proposal-process-grid">
              <div><span>01</span><strong>{ru ? "Итоговое подтверждение" : "Final confirmation"}</strong><p>{ru ? "Подтверждаем объём, выбранную плёнку и доступ для монтажа." : "We confirm the selected scope, film and installation access."}</p></div>
              <div><span>02</span><strong>{ru ? "Планирование" : "Scheduling"}</strong><p>{ru ? "Менеджер согласует дату монтажа и подготовку объекта." : "Your manager coordinates the installation window and preparation."}</p></div>
              <div><span>03</span><strong>{ru ? "Профессиональный монтаж" : "Professional install"}</strong><p>{ru ? "Бригада защищает рабочую зону, устанавливает плёнку и проверяет каждый элемент." : "The crew protects the work area, installs the film and checks every section."}</p></div>
              <div><span>04</span><strong>{ru ? "Сдача проекта" : "Handover"}</strong><p>{ru ? "Вы получаете инструкции по уходу и применимые условия гарантии." : "You receive care guidance and the applicable product and workmanship terms."}</p></div>
            </div>
          </section>

          <section className="surface proposal-notes-section">
            <div className="proposal-section-label">04 / {ru ? "Вопросы" : "Questions"}</div>
            <h2 className="surface-title">{ru ? "Примечания для менеджера проекта" : "Notes for your project manager"}</h2>
            <label className="calculator-notes">
              <span>{ru ? "Ваше сообщение" : "Your message"}</span>
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
                {ru ? "Сохранить выбор" : "Update Selection"}
              </button>
              <div className="row-meta">{message}</div>
            </div>
          </section>
        </div>

        <aside className="client-proposal-side">
          <section className="surface proposal-agreement-panel">
            <div className="proposal-side-total">
              <span>{ru ? "Итого по выбранным работам" : "Selected project total"}</span>
              <strong>{formatCurrency(localSelectedTotal)}</strong>
              <small>{ru ? `Включено ${selectedCount} из ${proposal.items.length} позиций` : `${selectedCount} of ${proposal.items.length} service lines included`}</small>
            </div>
            <div className="proposal-section-label">05 / {ru ? "Согласование" : "Approval"}</div>
            <h2 className="surface-title">{ru ? "Согласовать коммерческое предложение" : "Approve your proposal"}</h2>
            <p className="surface-subtitle">
              {ru ? "Подпись подтверждает выбранные услуги и разрешает перейти к следующему этапу проекта." : "Signing confirms the selected services and authorizes the project to move forward."}
            </p>

            <div className="proposal-item-grid">
              <label className="calculator-field">
                <span>{ru ? "Полное имя" : "Full Name"}</span>
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
                <span>{ru ? "Должность" : "Title"}</span>
                <input
                  value={agreement.signer_title}
                  disabled={isLocked || saving}
                  onChange={(event) => setAgreement((current) => ({ ...current, signer_title: event.target.value }))}
                />
              </label>

              <label className="calculator-field">
                <span>{ru ? "Введите полное имя в качестве подписи" : "Type your full name as signature"}</span>
                <input
                  value={agreement.signature_text}
                  disabled={isLocked || saving}
                  onChange={(event) => setAgreement((current) => ({ ...current, signature_text: event.target.value }))}
                />
              </label>
            </div>

            <label className="calculator-notes">
              <span>{ru ? "Примечания клиента" : "Client Notes"}</span>
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
              <span>{ru ? "Я подтверждаю выбранные услуги и согласен продолжить." : "I confirm the selected services and agree to proceed."}</span>
            </label>

            <div className="proposal-builder-footer">
              <button type="button" className="accent-button" onClick={signAgreement} disabled={isLocked || saving}>
                {isLocked ? (ru ? "Договор подписан" : "Agreement Signed") : (ru ? "Подписать КП" : "Sign Agreement")}
              </button>
            </div>

            <div className="proposal-trust-note">
              <strong>Rolan PRO</strong>
              <span>Westlake Village, California</span>
              <a href="tel:+14243250512">(424) 325-0512</a>
              <a href="https://rolan-pro.com" target="_blank" rel="noreferrer">rolan-pro.com</a>
            </div>
          </section>

        </aside>
      </section>
    </div>
  );
}
