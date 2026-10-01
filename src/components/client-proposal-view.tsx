"use client";

import { useState, type ReactNode } from "react";

import { ProposalDrawing } from "@/components/proposal-drawing";
import { PublicWarrantySummary } from "@/components/public-warranty-summary";
import { SignaturePad } from "@/components/signature-pad";

type ClientProposalViewProps = {
  initialProposal: any;
  language?: "en" | "ru";
  onAgreementSigned?: () => void;
  /** RU/EN switch rendered inside the cover, not floating over it. */
  languageSwitch?: ReactNode;
  /** Payment block, placed right after the signed agreement. */
  paymentSlot?: ReactNode;
  /** Deposit due on signing (0 = pay on completion). */
  depositAmount?: number;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

/** One intro per direction present in the proposal (smart + solar + safety → three cards). */
function serviceIntrosFor(items: any[], language: "en" | "ru") {
  const intros = language === "ru" ? SERVICE_INTROS_RU : SERVICE_INTROS;
  const found = new Map<string, (typeof intros)[string]>();
  for (const item of items || []) {
    const raw = `${item?.film?.category_name ?? ""} ${item?.service_type?.name ?? ""} ${item?.service_type?.name_en ?? ""} ${item?.service_type?.service_code ?? ""}`.toLowerCase();
    const key = raw.includes("smart")
      ? "smart"
      : raw.includes("safety") || raw.includes("security") || raw.includes("protect")
        ? "protective"
        : raw.includes("decor")
          ? "decorative"
          : raw.includes("solar") || raw.includes("sun")
            ? "solar"
            : null;
    if (key && !found.has(key)) found.set(key, intros[key]);
  }
  return [...found.values()];
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
  languageSwitch,
  paymentSlot,
  depositAmount = 0,
}: ClientProposalViewProps) {
  const ru = language === "ru";
  const [proposal, setProposal] = useState(initialProposal);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [agreement, setAgreement] = useState({
    signer_name: proposal.agreement?.signer_name ?? "",
    signer_email: proposal.agreement?.signer_email ?? proposal.client?.email ?? "",
    signer_title: proposal.agreement?.signer_title ?? "",
    signature_text: proposal.agreement?.signer_name ?? "",
    client_notes: proposal.agreement?.client_notes ?? "",
    accepted_terms: Boolean(proposal.agreement?.accepted_terms),
    signature_image: null as string | null,
  });
  const canSign = Boolean(
    agreement.signer_name.trim() && /.+@.+\..+/.test(agreement.signer_email) && agreement.signature_image && agreement.accepted_terms,
  );

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
  const agreementTerms = (
          <ol className="rp-terms">
      <li>
        <strong>{ru ? "Объём работ" : "Scope"}</strong>
        <span>
          {ru
            ? `Позиции, выбранные выше (${selectedCount}), по рабочему чертежу — Приложение А.`
            : `The ${selectedCount} line${selectedCount === 1 ? "" : "s"} selected above, per the working drawing — Appendix A.`}
        </span>
      </li>
      <li>
        <strong>{ru ? "Стоимость" : "Price"}</strong>
        <span>{formatCurrency(localSelectedTotal)}</span>
      </li>
      <li>
        <strong>{ru ? "Оплата" : "Payment"}</strong>
        <span>
          {depositAmount > 0
            ? ru
              ? `Аванс ${formatCurrency(depositAmount)} при подписании, остаток ${formatCurrency(Math.max(0, localSelectedTotal - depositAmount))} — после выполнения работ.`
              : `Deposit ${formatCurrency(depositAmount)} on signing, balance ${formatCurrency(Math.max(0, localSelectedTotal - depositAmount))} on completion.`
            : ru
              ? "Оплата после выполнения работ."
              : "Payment on completion of the work."}
        </span>
      </li>
      <li>
        <strong>{ru ? "Сроки" : "Schedule"}</strong>
        <span>{ru ? "Дата монтажа согласуется с менеджером после подписания." : "The installation date is agreed with your manager after signing."}</span>
      </li>
      <li>
        <strong>{ru ? "Гарантия" : "Warranty"}</strong>
        <span>{ru ? "Как указано в разделе «Гарантия» выше." : "As stated in the Warranty section above."}</span>
      </li>
      <li>
        <strong>{ru ? "Изменения" : "Changes"}</strong>
        <span>{ru ? "Любое изменение объёма оформляется новой версией КП." : "Any change of scope is made as a new version of this proposal."}</span>
      </li>
    </ol>
  );
  const serviceIntros = serviceIntrosFor(proposal.items, language);
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

        {serviceIntros.map((serviceIntro) => (
          <section key={serviceIntro.title} className="proposal-print-solution">
            <div>
              <span>{ru ? "Рекомендуемое решение" : "Recommended solution"}</span>
              <h2>{serviceIntro.title}</h2>
              <p>{serviceIntro.body}</p>
            </div>
            <ul>{serviceIntro.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </section>
        ))}

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

        <ProposalDrawing
          items={proposal.items}
          language={language}
          clientName={proposal.client?.name ?? proposal.title}
          address={proposal.client?.service_address ?? ""}
          proposalCode={proposal.proposal_code ?? ""}
          ids="rpp"
        />

        <PublicWarrantySummary language={language} items={proposal.items} />

        <section className="proposal-print-terms">
          <h2>{ru ? "Договор на установку" : "Installation agreement"}</h2>
          {agreementTerms}
        </section>

        <section className="proposal-print-signatures">
          <div>
            {proposal.agreement?.signature_image ? (
              <img src={proposal.agreement.signature_image} alt="" style={{ maxHeight: 60 }} />
            ) : null}
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
          {languageSwitch}
        </div>

        <div className="proposal-hero-copy">
          <div className="landing-kicker">
            {proposal.proposal_code ?? (ru ? "Коммерческое предложение" : "Project proposal")} · {ru ? "до" : "valid through"} {formatDate(proposal.expires_at, language)}
          </div>
          <h1 className="client-proposal-title">{proposal.client?.name ?? proposal.title}</h1>
          <p className="client-proposal-address">{proposal.client?.service_address || (ru ? "Южная Калифорния" : "Southern California")}</p>
          <p className="landing-text">
            {ru
              ? "Решение по замеру вашего объекта: плёнки, чертёж проёмов, гарантия и договор — в одном документе."
              : "A solution built on your site measurement: films, a drawing of every opening, warranty and agreement — in one document."}
          </p>
          <div className="proposal-hero-actions">
            <a href="#project-scope" className="proposal-primary-link">{ru ? "Смотреть проект" : "Review the project"}</a>
            <a href="#proposal-agreement" className="proposal-primary-link rp-ghost-link">{ru ? "Подписать" : "Sign"}</a>
          </div>
        </div>

        <div className="client-proposal-summary">
          <span>{ru ? "Стоимость выбранных работ" : "Your selected investment"}</span>
          <strong>{formatCurrency(localSelectedTotal)}</strong>
          <small>
            {selectedCount} {ru ? "позиций" : selectedCount === 1 ? "line" : "lines"} · {projectSummary.area ? `${projectSummary.area.toFixed(0)} sq ft` : ""}
          </small>
        </div>
      </header>

      <main className="rp-body">
        {serviceIntros.length ? (
          <section className="rp-section">
            <div className="rp-kicker">01 / {ru ? "Решение" : "Solution"}</div>
            <h2 className="rp-h2">{ru ? "Что мы установим" : "What we will install"}</h2>
            <div className="rp-solution-grid">
              {serviceIntros.map((intro) => (
                <article key={intro.title} className="rp-solution-card">
                  <strong>{intro.title}</strong>
                  <p>{intro.body}</p>
                  <ul className="rp-checklist">
                    {intro.points.slice(0, 3).map((point) => <li key={point}>{point}</li>)}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rp-section" id="project-scope">
          <div className="rp-kicker">02 / {ru ? "Объём по замеру" : "Measured scope"}</div>
          <h2 className="rp-h2">{ru ? "Ваш проект по помещениям" : "Your project, room by room"}</h2>
          <p className="rp-lead">
            {ru ? "Можно убрать ненужную позицию — итог пересчитается сразу." : "Switch off anything you don't need — the total updates instantly."}
          </p>

          {roomGroups.map((group) => {
            const roomTotal = group.items.reduce((sum: number, item: any) => sum + (item.client_selected ? item.line_price : 0), 0);
            return (
              <div key={group.room} className="rp-room">
                <div className="rp-room-head">
                  <h3 className="rp-h3">{localizeItemText(group.room, language)}</h3>
                  <span>{formatCurrency(roomTotal)}</span>
                </div>
                {group.items.map((item: any) => {
                  const facts = [...new Set([...getMeasurementSummary(item, language), ...getDynamicFieldSummary(item, language)])]
                    .filter((fact) => !/^(Стекло|Glass|Монтаж|Install):/.test(fact));
                  const addonSummary = getAddonSummary(item.addons_snapshot, language);
                  const rawTitle = localizeItemText(ru ? item.title_ru || item.title : item.title_en || item.title, language);
                  const title = rawTitle.replace(new RegExp(`^${escapeRegExp(String(item.room_name ?? ""))}\\s*·\\s*`), "");
                  const filmName = item.film
                    ? `${ru ? item.film.brand_name_ru || item.film.brand_name : item.film.brand_name_en || item.film.brand_name} ${ru ? item.film.model_name_ru || item.film.model_name : item.film.model_name_en || item.film.model_name}`
                    : localizeItemText(ru ? item.description_ru || item.description : item.description_en || item.description, language);
                  return (
                    <article key={item.proposal_item_id} className={`rp-line${item.client_selected ? "" : " rp-line-off"}`}>
                      <div className="rp-line-main">
                        <strong>{title || (ru ? "Позиция" : "Line item")}</strong>
                        {filmName && filmName !== title ? <span className="rp-line-film">{filmName}</span> : null}
                        {facts.length ? <span className="rp-line-facts">{facts.join(" · ")}</span> : null}
                        {filmSpecChips(item.film, language).length ? (
                          <span className="rp-line-facts">{filmSpecChips(item.film, language).join(" · ")}</span>
                        ) : null}
                        {addonSummary.map((summary) => <span key={summary} className="rp-line-facts">+ {summary}</span>)}
                      </div>
                      <div className="rp-line-side">
                        <span className="rp-line-price">{formatCurrency(item.line_price)}</span>
                        <label className="rp-switch" title={ru ? "Включить в проект" : "Include in project"}>
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
                          <span aria-hidden="true" />
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>
            );
          })}

          <div className="rp-total-row">
            <span>{ru ? "Итого" : "Total"}</span>
            <strong>{formatCurrency(localSelectedTotal)}</strong>
          </div>
        </section>

        <ProposalDrawing
          items={proposal.items}
          language={language}
          clientName={proposal.client?.name ?? proposal.title}
          address={proposal.client?.service_address ?? ""}
          proposalCode={proposal.proposal_code ?? ""}
        />

        <PublicWarrantySummary language={language} items={proposal.items} />

        <section className="rp-section">
          <div className="rp-kicker">{ru ? "Порядок работ" : "How it works"}</div>
          <h2 className="rp-h2">{ru ? "Что дальше" : "What happens next"}</h2>
          <ol className="rp-steps">
            <li><strong>{ru ? "Подпись и аванс" : "Sign & deposit"}</strong><span>{ru ? "Вы подписываете договор здесь и вносите аванс." : "You sign the agreement here and pay the deposit."}</span></li>
            <li><strong>{ru ? "Дата монтажа" : "Scheduling"}</strong><span>{ru ? "Менеджер согласует с вами дату и подготовку объекта." : "Your manager agrees the installation date and site preparation with you."}</span></li>
            <li><strong>{ru ? "Монтаж" : "Installation"}</strong><span>{ru ? "Бригада защищает рабочую зону, сверяет размеры с чертежом и устанавливает плёнку." : "The crew protects the work area, checks sizes against the drawing and installs the film."}</span></li>
            <li><strong>{ru ? "Сдача" : "Handover"}</strong><span>{ru ? "Проверяем каждый проём вместе с вами, передаём гарантийный сертификат." : "We inspect every opening with you and hand over the warranty certificate."}</span></li>
          </ol>
        </section>

        <section className="rp-section rp-agreement" id="proposal-agreement">
          <div className="rp-kicker">{ru ? "Договор" : "Agreement"}</div>
          <h2 className="rp-h2">{ru ? "Договор на установку" : "Installation agreement"}</h2>
          {agreementTerms}
          <button type="button" className="rp-link-button rp-pdf" onClick={() => window.print()}>
            {ru ? "Скачать КП и договор в PDF" : "Download proposal & agreement (PDF)"}
          </button>
          <p className="rp-small">
            {ru ? "Полные условия: " : "Full terms: "}
            <a href="/terms" target="_blank" rel="noreferrer">{ru ? "условия обслуживания Rolan PRO" : "Rolan PRO terms of service"}</a>.
          </p>

          {isLocked && proposal.agreement?.signed_at ? (
            <div className="rp-signed">
              <span>{ru ? "Подписано" : "Signed"}</span>
              <strong>{proposal.agreement.signer_name}</strong>
              <small>{formatDate(proposal.agreement.signed_at, language)}</small>
              {proposal.agreement.signature_image ? (
                <img src={proposal.agreement.signature_image} alt={ru ? "Подпись клиента" : "Client signature"} />
              ) : null}
            </div>
          ) : (
            <div className="rp-sign-form">
              <label className="rp-field">
                <span>{ru ? "Полное имя" : "Full name"}</span>
                <input
                  value={agreement.signer_name}
                  disabled={isLocked || saving}
                  autoComplete="name"
                  onChange={(event) =>
                    setAgreement((current) => ({ ...current, signer_name: event.target.value, signature_text: event.target.value }))
                  }
                />
              </label>
              <label className="rp-field">
                <span>Email</span>
                <input
                  type="email"
                  value={agreement.signer_email}
                  disabled={isLocked || saving}
                  autoComplete="email"
                  onChange={(event) => setAgreement((current) => ({ ...current, signer_email: event.target.value }))}
                />
              </label>
              <SignaturePad
                language={language}
                disabled={isLocked || saving}
                onChange={(image) => setAgreement((current) => ({ ...current, signature_image: image }))}
              />
              <label className="rp-field">
                <span>{ru ? "Комментарий менеджеру (необязательно)" : "Note to your manager (optional)"}</span>
                <textarea
                  rows={2}
                  value={agreement.client_notes}
                  disabled={isLocked || saving}
                  onChange={(event) => setAgreement((current) => ({ ...current, client_notes: event.target.value }))}
                />
              </label>
              <label className="rp-consent">
                <input
                  type="checkbox"
                  checked={agreement.accepted_terms}
                  disabled={isLocked || saving}
                  onChange={(event) => setAgreement((current) => ({ ...current, accepted_terms: event.target.checked }))}
                />
                <span>
                  {ru
                    ? "Я согласен с договором, рабочим чертежом (Приложение А) и подписываю электронно."
                    : "I agree to this agreement and the working drawing (Appendix A) and sign electronically."}
                </span>
              </label>
              <button
                type="button"
                className="rp-primary-button"
                onClick={signAgreement}
                disabled={isLocked || saving || !canSign}
              >
                {saving ? (ru ? "Подписываем…" : "Signing…") : ru ? `Подписать · ${formatCurrency(localSelectedTotal)}` : `Sign · ${formatCurrency(localSelectedTotal)}`}
              </button>
              {!canSign && !saving ? (
                <p className="rp-small">
                  {ru ? "Нужны имя, email, подпись и согласие." : "Name, email, signature and consent are required."}
                </p>
              ) : null}
            </div>
          )}
          <p className="rp-small" role="status">{message}</p>
        </section>

        {paymentSlot}

        <footer className="rp-footer">
          <img src="/landing/rolan-logo.webp" alt="Rolan PRO" />
          <span>Westlake Village, California</span>
          <a href="tel:+14243250512">(424) 325-0512</a>
          <a href="https://rolan-pro.com" target="_blank" rel="noreferrer">rolan-pro.com</a>
        </footer>
      </main>
    </div>
  );
}
