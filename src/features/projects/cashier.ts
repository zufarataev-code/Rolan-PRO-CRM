/**
 * Кассовая логика создания проекта.
 *
 * Проект — контейнер направлений (ServiceType: SOLAR_FILM, SAFETY_FILM, SMART_FILM,
 * DECORATIVE_FILM, PRIVACY_FILM). В каждом направлении менеджер тапает тип плёнки,
 * класс и модель со склада, услуги направления. Размеры общие на проект; у окна
 * отмечается, какие направления на него идут. Чек собирается группами по
 * направлениям, в конце — «общее по объекту» (удаление старой плёнки, техника,
 * подрядчик).
 *
 * Правила денег:
 *  - цена плёнки за sq ft вводится менеджером в коридоре [min, max] модели,
 *    ниже минимума продать нельзя (ошибка, не предупреждение);
 *  - высотные работы — коэффициент к монтажной части цены, не к плёнке;
 *    подъёмник — отдельной строкой по стоимости дня; альпинист — подрядчик;
 *  - удаление старой плёнки — галочка на окне, суммируется в одну строку по
 *    тарифу справочника;
 *  - минимум проекта — сумма строк по минимальным ценам; от него владелец
 *    считает экономику.
 *
 * Модуль чистый: без Prisma, его одинаково используют экран кассы, API создания
 * проекта и тесты.
 */

import { cuttingPlanForOpenings } from "../cutting/openings";
import type { CuttingPlan } from "../cutting/types";

export type CashierDirectionCode = "SOLAR_FILM" | "SAFETY_FILM" | "SMART_FILM" | "DECORATIVE_FILM" | "PRIVACY_FILM";

export const CASHIER_DIRECTIONS: Array<{
  code: CashierDirectionCode;
  film_category: string;
  label_ru: string;
  color_token: string;
}> = [
  { code: "SOLAR_FILM", film_category: "SOLAR", label_ru: "Солнцезащитная", color_token: "dir-sun" },
  { code: "SAFETY_FILM", film_category: "SAFETY", label_ru: "Защитная", color_token: "dir-safety" },
  { code: "SMART_FILM", film_category: "SMART", label_ru: "Смарт", color_token: "dir-smart" },
  { code: "DECORATIVE_FILM", film_category: "DECORATIVE", label_ru: "Декоративная", color_token: "dir-decor" },
  { code: "PRIVACY_FILM", film_category: "PRIVACY", label_ru: "Приватная", color_token: "dir-privacy" },
];

export type FilmClass = "standard" | "premium";

export type CashierFilm = {
  film_id: string;
  category_code: string;
  film_type_code: string | null;
  film_class: FilmClass;
  brand_code: string;
  model_name: string;
  vlt_percent: number | null;
  price_per_sqft: number | null;
  min_price_per_sqft: number | null;
  max_price_per_sqft: number | null;
  roll_widths_in: number[] | null;
  cutting_margin_in: number | null;
  stock_sqft: number | null;
  stock_low_sqft: number | null;
};

export type CashierAddon = {
  service_addon_id: string;
  direction_code: CashierDirectionCode;
  addon_code: string;
  name_ru: string;
  unit_type: string;
  default_price: number;
  min_price: number;
  color_token: string | null;
  suggested_with_addon_codes: string[];
};

export type AccessLevel = {
  access_code: string;
  name_ru: string;
  labor_coefficient: number;
  equipment_day_cost: number;
  is_contractor: boolean;
};

export const DEFAULT_ACCESS_LEVELS: AccessLevel[] = [
  { access_code: "floor", name_ru: "С пола (до 8 ft)", labor_coefficient: 1, equipment_day_cost: 0, is_contractor: false },
  { access_code: "ladder", name_ru: "Стремянка (8–12 ft)", labor_coefficient: 1.2, equipment_day_cost: 0, is_contractor: false },
  { access_code: "tower", name_ru: "Тура / леса (12–20 ft)", labor_coefficient: 1.5, equipment_day_cost: 0, is_contractor: false },
  { access_code: "lift", name_ru: "Подъёмник (20+ ft)", labor_coefficient: 2, equipment_day_cost: 450, is_contractor: false },
  { access_code: "rope", name_ru: "Альпинист", labor_coefficient: 1, equipment_day_cost: 0, is_contractor: true },
];

export type CashierCatalog = {
  films: CashierFilm[];
  addons: CashierAddon[];
  access_levels?: AccessLevel[];
  /** Монтажная часть цены за sq ft по направлению — к ней применяется коэффициент доступа. */
  installation_cost_per_sqft: Partial<Record<CashierDirectionCode, number>>;
  /** Тариф удаления старой плёнки, $/sq ft. */
  removal_rate_per_sqft: number;
  removal_min_rate_per_sqft?: number;
};

export type CashierOpening = {
  key: string;
  room_name?: string | null;
  opening_type?: string | null;
  width_in: number;
  height_in: number;
  quantity: number;
  sash_layout_code?: string | null;
  sash_cols?: number | null;
  sash_rows?: number | null;
  access_code?: string | null;
  removal_required?: boolean;
  /** Направления, которые идут на это окно. */
  direction_codes: CashierDirectionCode[];
  /** Плёнка только на это окно (переопределение плёнки направления). */
  film_override_id?: string | null;
};

export type CashierDirectionInput = {
  direction_code: CashierDirectionCode;
  film_type_code?: string | null;
  film_class?: FilmClass | null;
  brand_code?: string | null;
  film_id?: string | null;
  /** Цена за sq ft, введённая менеджером; null — цена модели по умолчанию. */
  price_per_sqft?: number | null;
  /** Коды услуг направления, которые менеджер тапнул. */
  addon_codes: string[];
  /** Тип и размеры определит замерщик. */
  measurer_decides?: boolean;
};

export type CashierInput = {
  directions: CashierDirectionInput[];
  openings: CashierOpening[];
};

export type CashierLineKind = "film" | "addon" | "access" | "equipment" | "contractor" | "removal";

export type CashierLine = {
  kind: CashierLineKind;
  code: string;
  title_ru: string;
  detail_ru: string;
  color_token: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  min_unit_price: number;
  amount: number;
  min_amount: number;
  /** Ошибка коридора: цена ниже минимума. */
  below_minimum: boolean;
};

export type CashierGroup = {
  direction_code: CashierDirectionCode | "SITE";
  label_ru: string;
  color_token: string;
  is_primary: boolean;
  film: CashierFilm | null;
  glass_sqft: number;
  perimeter_lft: number;
  openings_count: number;
  cutting: CuttingPlan | null;
  lines: CashierLine[];
  amount: number;
  min_amount: number;
  /** Подсказки: услуги, которые обычно идут вместе с уже выбранными. */
  suggested_addon_codes: string[];
  measurer_decides: boolean;
};

export type CashierQuote = {
  groups: CashierGroup[];
  total: number;
  min_total: number;
  glass_sqft: number;
  film_sqft: number;
  openings_count: number;
  errors: string[];
  warnings: string[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function openingSqft(opening: Pick<CashierOpening, "width_in" | "height_in" | "quantity">) {
  return round2((opening.width_in * opening.height_in * opening.quantity) / 144);
}

export function openingPerimeterLft(opening: Pick<CashierOpening, "width_in" | "height_in" | "quantity">) {
  return round2((2 * (opening.width_in + opening.height_in) * opening.quantity) / 12);
}

export type FilmFilter = {
  direction_code: CashierDirectionCode;
  film_type_code?: string | null;
  film_class?: FilmClass | null;
  brand_code?: string | null;
  query?: string | null;
};

/** Плёнки для 3-го уровня кассы: направление → тип → класс → бренд, плюс умный поиск. Сначала те, что есть на складе. */
export function filterFilms(films: CashierFilm[], filter: FilmFilter) {
  const direction = CASHIER_DIRECTIONS.find((item) => item.code === filter.direction_code);
  const tokens = (filter.query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return films
    .filter((film) => !direction || film.category_code === direction.film_category)
    .filter((film) => !filter.film_type_code || film.film_type_code === filter.film_type_code)
    .filter((film) => !filter.film_class || film.film_class === filter.film_class)
    .filter((film) => filter.film_class !== "premium" || !filter.brand_code || film.brand_code === filter.brand_code)
    .filter((film) => {
      if (tokens.length === 0) return true;
      const haystack = `${film.model_name} ${film.brand_code} ${film.film_type_code ?? ""} ${film.vlt_percent ?? ""}% vlt`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((a, b) => {
      const aStock = a.stock_sqft ?? 0;
      const bStock = b.stock_sqft ?? 0;
      return Number(bStock > 0) - Number(aStock > 0) || bStock - aStock || a.model_name.localeCompare(b.model_name);
    });
}

export type StockStatus = "ok" | "low" | "out" | "unknown";

export function filmStockStatus(film: Pick<CashierFilm, "stock_sqft" | "stock_low_sqft">): StockStatus {
  if (film.stock_sqft == null) return "unknown";
  if (film.stock_sqft <= 0) return "out";
  if (film.stock_low_sqft != null && film.stock_sqft < film.stock_low_sqft) return "low";
  return "ok";
}

export function validateFilmPrice(film: Pick<CashierFilm, "min_price_per_sqft" | "max_price_per_sqft">, price: number) {
  if (film.min_price_per_sqft != null && price < film.min_price_per_sqft) {
    return { ok: false as const, reason: "below_minimum" as const, min: film.min_price_per_sqft, max: film.max_price_per_sqft };
  }
  if (film.max_price_per_sqft != null && price > film.max_price_per_sqft) {
    return { ok: false as const, reason: "above_maximum" as const, min: film.min_price_per_sqft, max: film.max_price_per_sqft };
  }
  return { ok: true as const, min: film.min_price_per_sqft, max: film.max_price_per_sqft };
}

function addonLine(addon: CashierAddon, glassSqft: number, perimeterLft: number, openingsCount: number): CashierLine {
  const unit = addon.unit_type;
  const quantity = unit === "sqft" ? glassSqft : unit === "lft" ? perimeterLft : unit === "qty" ? openingsCount : 1;
  const amount = round2(quantity * addon.default_price);
  const minAmount = round2(quantity * addon.min_price);
  const detail =
    unit === "sqft"
      ? `${glassSqft} sq ft × $${addon.default_price}`
      : unit === "lft"
        ? `${perimeterLft} пог. фут × $${addon.default_price}`
        : unit === "qty"
          ? `${openingsCount} шт × $${addon.default_price}`
          : `фикс $${addon.default_price}`;
  return {
    kind: "addon",
    code: addon.addon_code,
    title_ru: addon.name_ru,
    detail_ru: detail,
    color_token: addon.color_token,
    quantity,
    unit,
    unit_price: addon.default_price,
    min_unit_price: addon.min_price,
    amount,
    min_amount: minAmount,
    below_minimum: false,
  };
}

/** Собирает чек из того, что тапнул менеджер и что лежит в размерах. */
export function buildCashierQuote(input: CashierInput, catalog: CashierCatalog): CashierQuote {
  const accessLevels = catalog.access_levels?.length ? catalog.access_levels : DEFAULT_ACCESS_LEVELS;
  const accessByCode = new Map(accessLevels.map((level) => [level.access_code, level]));
  const filmById = new Map(catalog.films.map((film) => [film.film_id, film]));
  const errors: string[] = [];
  const warnings: string[] = [];
  const groups: CashierGroup[] = [];
  let total = 0;
  let minTotal = 0;
  let filmSqftTotal = 0;

  input.directions.forEach((direction, index) => {
    const meta = CASHIER_DIRECTIONS.find((item) => item.code === direction.direction_code);
    if (!meta) {
      errors.push(`unknown_direction:${direction.direction_code}`);
      return;
    }
    const openings = input.openings.filter((opening) => opening.direction_codes.includes(direction.direction_code));
    const glassSqft = round2(openings.reduce((sum, opening) => sum + openingSqft(opening), 0));
    const perimeterLft = round2(openings.reduce((sum, opening) => sum + openingPerimeterLft(opening), 0));
    const openingsCount = openings.reduce((sum, opening) => sum + opening.quantity, 0);
    const film = direction.film_id ? filmById.get(direction.film_id) ?? null : null;
    const lines: CashierLine[] = [];
    let groupAmount = 0;
    let groupMin = 0;
    let cutting: CuttingPlan | null = null;

    // Плёнка: строка всегда есть, цена — только когда известны модель и размеры.
    if (direction.measurer_decides || !film) {
      lines.push({
        kind: "film",
        code: film ? film.film_id : "film_pending",
        title_ru: meta.label_ru + (film ? ` · ${film.model_name}` : ""),
        detail_ru: direction.measurer_decides ? "тип, модель и размеры определит замерщик" : "модель не выбрана",
        color_token: meta.color_token,
        quantity: glassSqft,
        unit: "sqft",
        unit_price: 0,
        min_unit_price: 0,
        amount: 0,
        min_amount: 0,
        below_minimum: false,
      });
      if (!direction.measurer_decides && !film) warnings.push(`film_missing:${direction.direction_code}`);
    } else {
      const price = direction.price_per_sqft ?? film.price_per_sqft ?? 0;
      const check = validateFilmPrice(film, price);
      const minPrice = film.min_price_per_sqft ?? price;
      const amount = round2(glassSqft * price);
      const minAmount = round2(glassSqft * minPrice);
      if (!check.ok && check.reason === "below_minimum") errors.push(`below_minimum:${direction.direction_code}`);
      if (!check.ok && check.reason === "above_maximum") warnings.push(`above_maximum:${direction.direction_code}`);
      if (glassSqft === 0) warnings.push(`no_openings:${direction.direction_code}`);
      const stock = filmStockStatus(film);
      if (stock === "out") warnings.push(`stock_out:${film.film_id}`);
      if (stock === "low") warnings.push(`stock_low:${film.film_id}`);

      cutting = cuttingPlanForOpenings(
        openings.map((opening) => ({
          key: opening.key,
          room_name: opening.room_name,
          window_name: opening.opening_type,
          width_in: opening.width_in,
          height_in: opening.height_in,
          quantity: opening.quantity,
          sash_layout_code: opening.sash_layout_code,
          sash_cols: opening.sash_cols,
          sash_rows: opening.sash_rows,
        })),
        {
          overlapIn: film.cutting_margin_in ?? undefined,
          rollWidthsIn: film.roll_widths_in?.length ? film.roll_widths_in : undefined,
        },
      );
      // Куски шире любого рулона алгоритм не раскладывает; их плёнку считаем по размеру с припуском,
      // чтобы расход не занижался, и помечаем стык.
      const unfitSqft = cutting
        ? round2(cutting.unfitPieces.reduce((sum, piece) => sum + (piece.requiredWidthIn * piece.requiredLengthIn) / 144, 0))
        : 0;
      const filmSqft = cutting ? round2(cutting.summary.materialConsumptionSqft + unfitSqft) : 0;
      if (cutting) filmSqftTotal += filmSqft;
      if (cutting && cutting.summary.unfitCount > 0) warnings.push(`cutting_seam:${direction.direction_code}`);
      if (cutting && film.stock_sqft != null && filmSqft > film.stock_sqft) warnings.push(`stock_short:${film.film_id}`);

      lines.push({
        kind: "film",
        code: film.film_id,
        title_ru: `${meta.label_ru} · ${film.model_name}`,
        detail_ru:
          `${openingsCount} окон · ${glassSqft} sq ft × $${price}` +
          (cutting ? ` · по раскрою ${filmSqft} sq ft` + (cutting.summary.unfitCount > 0 ? ` · стык: ${cutting.summary.unfitCount}` : "") : ""),
        color_token: meta.color_token,
        quantity: glassSqft,
        unit: "sqft",
        unit_price: price,
        min_unit_price: minPrice,
        amount,
        min_amount: minAmount,
        below_minimum: !check.ok && check.reason === "below_minimum",
      });
      groupAmount += amount;
      groupMin += minAmount;
    }

    // Услуги направления.
    const directionAddons = catalog.addons.filter((addon) => addon.direction_code === direction.direction_code);
    for (const code of direction.addon_codes) {
      const addon = directionAddons.find((item) => item.addon_code === code);
      if (!addon) {
        warnings.push(`unknown_addon:${direction.direction_code}:${code}`);
        continue;
      }
      const line = addonLine(addon, glassSqft, perimeterLft, openingsCount);
      lines.push(line);
      groupAmount += line.amount;
      groupMin += line.min_amount;
    }

    // Подсказки: услуга, у которой suggested_with пересекается с выбранными, но она сама не выбрана.
    const suggested = directionAddons
      .filter((addon) => !direction.addon_codes.includes(addon.addon_code))
      .filter((addon) => addon.suggested_with_addon_codes.some((code) => direction.addon_codes.includes(code)))
      .map((addon) => addon.addon_code);

    // Высотные работы — коэффициент к монтажной части по окнам этого направления.
    const laborRate = catalog.installation_cost_per_sqft[direction.direction_code] ?? 0;
    for (const level of accessLevels) {
      if (level.access_code === "floor" || level.is_contractor || level.labor_coefficient <= 1) continue;
      const atLevel = openings.filter((opening) => (opening.access_code ?? "floor") === level.access_code);
      if (atLevel.length === 0) continue;
      const sqft = round2(atLevel.reduce((sum, opening) => sum + openingSqft(opening), 0));
      const amount = round2(sqft * laborRate * (level.labor_coefficient - 1));
      lines.push({
        kind: "access",
        code: level.access_code,
        title_ru: `Высотные работы · ${level.name_ru}`,
        detail_ru: `${sqft} sq ft · монтаж $${laborRate} × (${level.labor_coefficient} − 1)`,
        color_token: "addon-height",
        quantity: sqft,
        unit: "sqft",
        unit_price: round2(laborRate * (level.labor_coefficient - 1)),
        min_unit_price: round2(laborRate * (level.labor_coefficient - 1)),
        amount,
        min_amount: amount,
        below_minimum: false,
      });
      groupAmount += amount;
      groupMin += amount;
    }

    total += groupAmount;
    minTotal += groupMin;
    groups.push({
      direction_code: direction.direction_code,
      label_ru: meta.label_ru,
      color_token: meta.color_token,
      is_primary: index === 0,
      film,
      glass_sqft: glassSqft,
      perimeter_lft: perimeterLft,
      openings_count: openingsCount,
      cutting,
      lines,
      amount: round2(groupAmount),
      min_amount: round2(groupMin),
      suggested_addon_codes: suggested,
      measurer_decides: Boolean(direction.measurer_decides),
    });
  });

  // Общее по объекту.
  const siteLines: CashierLine[] = [];
  const removalOpenings = input.openings.filter((opening) => opening.removal_required);
  if (removalOpenings.length > 0) {
    const sqft = round2(removalOpenings.reduce((sum, opening) => sum + openingSqft(opening), 0));
    const count = removalOpenings.reduce((sum, opening) => sum + opening.quantity, 0);
    const rate = catalog.removal_rate_per_sqft;
    const minRate = catalog.removal_min_rate_per_sqft ?? rate;
    siteLines.push({
      kind: "removal",
      code: "REMOVAL",
      title_ru: "Удаление старой плёнки",
      detail_ru: `${count} окон · ${sqft} sq ft × $${rate} из прайса`,
      color_token: "addon-removal",
      quantity: sqft,
      unit: "sqft",
      unit_price: rate,
      min_unit_price: minRate,
      amount: round2(sqft * rate),
      min_amount: round2(sqft * minRate),
      below_minimum: false,
    });
  }
  for (const level of accessLevels) {
    const atLevel = input.openings.filter((opening) => (opening.access_code ?? "floor") === level.access_code);
    if (atLevel.length === 0) continue;
    if (level.equipment_day_cost > 0) {
      siteLines.push({
        kind: "equipment",
        code: `equipment:${level.access_code}`,
        title_ru: `Аренда техники · ${level.name_ru}`,
        detail_ru: "1 день · по счёту аренды",
        color_token: "addon-equipment",
        quantity: 1,
        unit: "day",
        unit_price: level.equipment_day_cost,
        min_unit_price: level.equipment_day_cost,
        amount: level.equipment_day_cost,
        min_amount: level.equipment_day_cost,
        below_minimum: false,
      });
    }
    if (level.is_contractor) {
      const count = atLevel.reduce((sum, opening) => sum + opening.quantity, 0);
      siteLines.push({
        kind: "contractor",
        code: `contractor:${level.access_code}`,
        title_ru: `${level.name_ru} · подрядчик`,
        detail_ru: `${count} окон · сумма по смете подрядчика`,
        color_token: "addon-equipment",
        quantity: count,
        unit: "qty",
        unit_price: 0,
        min_unit_price: 0,
        amount: 0,
        min_amount: 0,
        below_minimum: false,
      });
      warnings.push("contractor_quote_required");
    }
  }
  if (siteLines.length > 0) {
    const amount = round2(siteLines.reduce((sum, line) => sum + line.amount, 0));
    const minAmount = round2(siteLines.reduce((sum, line) => sum + line.min_amount, 0));
    total += amount;
    minTotal += minAmount;
    groups.push({
      direction_code: "SITE",
      label_ru: "Общее по объекту",
      color_token: "muted",
      is_primary: false,
      film: null,
      glass_sqft: 0,
      perimeter_lft: 0,
      openings_count: 0,
      cutting: null,
      lines: siteLines,
      amount,
      min_amount: minAmount,
      suggested_addon_codes: [],
      measurer_decides: false,
    });
  }

  return {
    groups,
    total: round2(total),
    min_total: round2(minTotal),
    glass_sqft: round2(input.openings.reduce((sum, opening) => sum + openingSqft(opening), 0)),
    film_sqft: round2(filmSqftTotal),
    openings_count: input.openings.reduce((sum, opening) => sum + opening.quantity, 0),
    errors,
    warnings,
  };
}
