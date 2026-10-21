/** Разбор тела запроса кассы: строгие типы, без доверия к клиенту. */

import { CASHIER_DIRECTIONS, type CashierDirectionCode, type CashierInput, type CashierOpening } from "./cashier";

const DIRECTION_CODES = new Set<string>(CASHIER_DIRECTIONS.map((item) => item.code));

const asRecord = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const positive = (value: unknown) => {
  const parsed = num(value);
  return parsed !== null && parsed > 0 ? parsed : null;
};

export type CashierPayloadError = { field: string; message: string };

export function parseCashierInput(body: unknown): { ok: true; input: CashierInput } | { ok: false; errors: CashierPayloadError[] } {
  const root = asRecord(body);
  const errors: CashierPayloadError[] = [];
  if (!root) return { ok: false, errors: [{ field: "body", message: "JSON object expected" }] };

  const directions = (Array.isArray(root.directions) ? root.directions : [])
    .map((item, index) => {
      const record = asRecord(item);
      const code = text(record?.direction_code);
      if (!record || !DIRECTION_CODES.has(code)) {
        errors.push({ field: `directions[${index}].direction_code`, message: "unknown direction" });
        return null;
      }
      const addonCodes = Array.isArray(record.addon_codes) ? record.addon_codes.map(text).filter(Boolean) : [];
      const filmClass = text(record.film_class).toLowerCase();
      return {
        direction_code: code as CashierDirectionCode,
        film_type_code: text(record.film_type_code) || null,
        film_class: filmClass === "premium" ? ("premium" as const) : filmClass === "standard" ? ("standard" as const) : null,
        brand_code: text(record.brand_code) || null,
        film_id: text(record.film_id) || null,
        price_per_sqft: num(record.price_per_sqft),
        addon_codes: addonCodes,
        measurer_decides: Boolean(record.measurer_decides),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  if (directions.length === 0) errors.push({ field: "directions", message: "at least one direction" });
  const seen = new Set<string>();
  for (const direction of directions) {
    if (seen.has(direction.direction_code)) errors.push({ field: "directions", message: `duplicate ${direction.direction_code}` });
    seen.add(direction.direction_code);
  }

  const openings = (Array.isArray(root.openings) ? root.openings : [])
    .map((item, index): CashierOpening | null => {
      const record = asRecord(item);
      if (!record) return null;
      const width = positive(record.width_in);
      const height = positive(record.height_in);
      const quantity = Math.max(1, Math.floor(positive(record.quantity) ?? 1));
      if (!width || !height) {
        errors.push({ field: `openings[${index}]`, message: "width_in and height_in must be positive inches" });
        return null;
      }
      if (width > 400 || height > 400) {
        errors.push({ field: `openings[${index}]`, message: "размер больше 400 дюймов — проверь единицы" });
        return null;
      }
      const directionCodes = (Array.isArray(record.direction_codes) ? record.direction_codes.map(text) : []).filter((code) => DIRECTION_CODES.has(code)) as CashierDirectionCode[];
      return {
        key: text(record.key) || `O${index + 1}`,
        room_name: text(record.room_name) || null,
        opening_type: text(record.opening_type) || null,
        width_in: width,
        height_in: height,
        quantity,
        sash_layout_code: text(record.sash_layout_code) || null,
        sash_cols: positive(record.sash_cols) ? Math.floor(positive(record.sash_cols)!) : null,
        sash_rows: positive(record.sash_rows) ? Math.floor(positive(record.sash_rows)!) : null,
        access_code: text(record.access_code) || null,
        removal_required: Boolean(record.removal_required),
        direction_codes: directionCodes.length ? directionCodes : directions.length ? [directions[0].direction_code] : [],
        film_override_id: text(record.film_override_id) || null,
      };
    })
    .filter((item): item is CashierOpening => item !== null);

  if (errors.length) return { ok: false, errors };
  return { ok: true, input: { directions, openings } };
}
