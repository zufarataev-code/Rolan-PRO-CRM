import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCashierQuote,
  filmStockStatus,
  filterFilms,
  validateFilmPrice,
  type CashierCatalog,
  type CashierFilm,
  type CashierOpening,
} from "./cashier";

const films: CashierFilm[] = [
  { film_id: "r35", category_code: "SOLAR", film_type_code: "ceramic", film_class: "standard", brand_code: "ROLANPRO", model_name: "Rolan Ceramic R-35", vlt_percent: 35, price_per_sqft: 6.5, min_price_per_sqft: 5, max_price_per_sqft: 8, roll_widths_in: [36, 48, 60, 72], cutting_margin_in: 1, stock_sqft: 420, stock_low_sqft: 200 },
  { film_id: "r20", category_code: "SOLAR", film_type_code: "ceramic", film_class: "standard", brand_code: "ROLANPRO", model_name: "Rolan Ceramic R-20", vlt_percent: 20, price_per_sqft: 7, min_price_per_sqft: 5.5, max_price_per_sqft: 9, roll_widths_in: [36, 48, 60, 72], cutting_margin_in: 1, stock_sqft: 0, stock_low_sqft: 200 },
  { film_id: "cr70", category_code: "SOLAR", film_type_code: "ceramic", film_class: "premium", brand_code: "3M", model_name: "3M Crystalline 70", vlt_percent: 70, price_per_sqft: 11, min_price_per_sqft: 9, max_price_per_sqft: 14, roll_widths_in: [36, 48, 60, 72], cutting_margin_in: 1, stock_sqft: 250, stock_low_sqft: 100 },
  { film_id: "m35", category_code: "SOLAR", film_type_code: "metal", film_class: "standard", brand_code: "ROLANPRO", model_name: "Rolan Metal M-35", vlt_percent: 35, price_per_sqft: 6, min_price_per_sqft: 4.5, max_price_per_sqft: 7.5, roll_widths_in: [36, 60, 72], cutting_margin_in: 1, stock_sqft: 140, stock_low_sqft: 200 },
  { film_id: "a2", category_code: "SAFETY", film_type_code: "a2", film_class: "standard", brand_code: "ROLANPRO", model_name: "Rolan Safety 12 mil", vlt_percent: 88, price_per_sqft: 9, min_price_per_sqft: 7, max_price_per_sqft: 12, roll_widths_in: [48, 60, 72], cutting_margin_in: 1, stock_sqft: 220, stock_low_sqft: 200 },
];

const catalog: CashierCatalog = {
  films,
  addons: [
    { service_addon_id: "sol-out", direction_code: "SOLAR_FILM", addon_code: "EXTERIOR", name_ru: "Наружная оклейка", unit_type: "sqft", default_price: 2.5, min_price: 2, color_token: "dir-sun", suggested_with_addon_codes: [] },
    { service_addon_id: "sol-sil", direction_code: "SOLAR_FILM", addon_code: "SILICONE", name_ru: "Силикон", unit_type: "lft", default_price: 1.5, min_price: 1.2, color_token: "addon-silicone", suggested_with_addon_codes: ["EXTERIOR"] },
    { service_addon_id: "saf-anchor", direction_code: "SAFETY_FILM", addon_code: "ANCHORING", name_ru: "Анкеровка", unit_type: "lft", default_price: 3, min_price: 2.5, color_token: "addon-anchoring", suggested_with_addon_codes: [] },
  ],
  installation_cost_per_sqft: { SOLAR_FILM: 3.5, SAFETY_FILM: 4 },
  removal_rate_per_sqft: 1.2,
  removal_min_rate_per_sqft: 1,
};

const openings: CashierOpening[] = [
  { key: "В1", room_name: "Витрина", width_in: 96, height_in: 84, quantity: 2, access_code: "floor", removal_required: false, direction_codes: ["SAFETY_FILM"] },
  { key: "Г1", room_name: "Гостиная", width_in: 72, height_in: 60, quantity: 2, access_code: "tower", removal_required: true, direction_codes: ["SOLAR_FILM"], sash_layout_code: "panoramic" },
  { key: "С1", room_name: "Спальня", width_in: 36, height_in: 48, quantity: 4, access_code: "floor", removal_required: false, direction_codes: ["SOLAR_FILM", "SAFETY_FILM"] },
];

test("films are filtered by direction, type, class and search; in-stock first", () => {
  const solarStandardCeramic = filterFilms(films, { direction_code: "SOLAR_FILM", film_type_code: "ceramic", film_class: "standard" });
  assert.deepEqual(solarStandardCeramic.map((f) => f.film_id), ["r35", "r20"]);
  const search = filterFilms(films, { direction_code: "SOLAR_FILM", query: "35 керам" });
  assert.deepEqual(search.map((f) => f.film_id), []);
  const byVlt = filterFilms(films, { direction_code: "SOLAR_FILM", query: "35" });
  assert.deepEqual(byVlt.map((f) => f.film_id), ["r35", "m35"]);
  const premium3m = filterFilms(films, { direction_code: "SOLAR_FILM", film_class: "premium", brand_code: "3M" });
  assert.deepEqual(premium3m.map((f) => f.film_id), ["cr70"]);
});

test("stock status follows the warehouse colour code", () => {
  assert.equal(filmStockStatus(films[0]), "ok");
  assert.equal(filmStockStatus(films[1]), "out");
  assert.equal(filmStockStatus(films[3]), "low");
  assert.equal(filmStockStatus({ stock_sqft: null, stock_low_sqft: null }), "unknown");
});

test("price corridor: below minimum is rejected, above maximum is flagged", () => {
  assert.equal(validateFilmPrice(films[0], 5).ok, true);
  assert.deepEqual(validateFilmPrice(films[0], 4.99), { ok: false, reason: "below_minimum", min: 5, max: 8 });
  assert.deepEqual(validateFilmPrice(films[0], 8.5), { ok: false, reason: "above_maximum", min: 5, max: 8 });
});

test("quote groups lines by direction, shares openings, adds site-wide lines and a project minimum", () => {
  const quote = buildCashierQuote(
    {
      directions: [
        { direction_code: "SOLAR_FILM", film_id: "r35", price_per_sqft: 6.5, addon_codes: ["EXTERIOR"] },
        { direction_code: "SAFETY_FILM", film_id: "a2", price_per_sqft: null, addon_codes: ["ANCHORING"] },
      ],
      openings,
    },
    catalog,
  );

  assert.deepEqual(quote.errors, []);
  const [solar, safety, site] = quote.groups;
  assert.equal(solar.direction_code, "SOLAR_FILM");
  assert.equal(solar.is_primary, true);
  // Солнце: гостиная 2×72×60 = 60 sq ft + спальня 4×36×48 = 48 sq ft.
  assert.equal(solar.glass_sqft, 108);
  assert.equal(solar.openings_count, 6);
  // Защита: витрина 2×96×84 = 112 + спальня 48 = 160 sq ft.
  assert.equal(safety.glass_sqft, 160);
  assert.equal(safety.lines[0].unit_price, 9); // цена модели по умолчанию
  // Силикон подсказывается, когда выбрана наружная оклейка.
  assert.deepEqual(solar.suggested_addon_codes, ["SILICONE"]);
  // Высотные: гостиная на туре — 60 sq ft × 3.5 × (1.5 − 1) = 105, только на солнце.
  const access = solar.lines.find((line) => line.kind === "access");
  assert.ok(access);
  assert.equal(access.amount, 105);
  assert.equal(safety.lines.some((line) => line.kind === "access"), false);
  // Общее по объекту: удаление старой на 2 панорамных = 60 sq ft × 1.2 = 72.
  assert.equal(site.direction_code, "SITE");
  const removal = site.lines.find((line) => line.kind === "removal");
  assert.ok(removal);
  assert.equal(removal.amount, 72);
  assert.equal(removal.min_amount, 60);
  // Плёнка солнца: 108 × 6.5 = 702; минимум 108 × 5 = 540.
  assert.equal(solar.lines[0].amount, 702);
  assert.equal(solar.lines[0].min_amount, 540);
  assert.ok(solar.cutting);
  assert.ok(solar.cutting.summary.materialConsumptionSqft > solar.glass_sqft);
  assert.ok(quote.film_sqft > quote.glass_sqft);
  // Витрина 96×84" шире любого рулона — предупреждение о стыке.
  assert.ok(quote.warnings.includes("cutting_seam:SAFETY_FILM"));
  assert.ok(quote.total > quote.min_total);
  assert.equal(quote.total, solar.amount + safety.amount + site.amount);
});

test("price below the corridor is an error and shows on the line", () => {
  const quote = buildCashierQuote(
    { directions: [{ direction_code: "SOLAR_FILM", film_id: "r35", price_per_sqft: 4, addon_codes: [] }], openings },
    catalog,
  );
  assert.deepEqual(quote.errors, ["below_minimum:SOLAR_FILM"]);
  assert.equal(quote.groups[0].lines[0].below_minimum, true);
});

test("measurer decides: film line without price, quote still totals site lines", () => {
  const quote = buildCashierQuote(
    { directions: [{ direction_code: "SOLAR_FILM", measurer_decides: true, addon_codes: [] }], openings },
    catalog,
  );
  assert.equal(quote.groups[0].lines[0].amount, 0);
  assert.equal(quote.groups[0].measurer_decides, true);
  assert.deepEqual(quote.errors, []);
  // Удаление 72 + высотные на туре 60 × 3.5 × 0.5 = 105: высота окна известна и без плёнки.
  assert.equal(quote.total, 177);
});

test("lift adds an equipment day, rope access adds a contractor placeholder and a warning", () => {
  const quote = buildCashierQuote(
    {
      directions: [{ direction_code: "SOLAR_FILM", film_id: "r35", addon_codes: [] }],
      openings: [
        { key: "Ф1", width_in: 60, height_in: 60, quantity: 1, access_code: "lift", direction_codes: ["SOLAR_FILM"] },
        { key: "Ф2", width_in: 60, height_in: 60, quantity: 1, access_code: "rope", direction_codes: ["SOLAR_FILM"] },
      ],
    },
    catalog,
  );
  const site = quote.groups.find((group) => group.direction_code === "SITE");
  assert.ok(site);
  assert.deepEqual(site.lines.map((line) => line.kind), ["equipment", "contractor"]);
  assert.equal(site.lines[0].amount, 450);
  assert.ok(quote.warnings.includes("contractor_quote_required"));
  const access = quote.groups[0].lines.find((line) => line.kind === "access");
  assert.ok(access);
  assert.equal(access.amount, 25 * 3.5 * 1);
});

test("out-of-stock film warns instead of blocking", () => {
  const quote = buildCashierQuote(
    { directions: [{ direction_code: "SOLAR_FILM", film_id: "r20", addon_codes: [] }], openings },
    catalog,
  );
  assert.ok(quote.warnings.includes("stock_out:r20"));
  assert.deepEqual(quote.errors, []);
});
