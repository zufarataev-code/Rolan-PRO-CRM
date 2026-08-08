export type ReferenceLocale = "ru" | "en";

export function resolveReferenceLabel<T extends Record<string, unknown>>(
  item: T,
  locale: ReferenceLocale,
) {
  const keys = locale === "ru"
    ? ["name_ru", "category_name_ru", "brand_name_ru", "model_name_ru", "item_name_ru"]
    : ["name_en", "category_name_en", "brand_name_en", "model_name_en", "item_name_en"];

  for (const key of keys) {
    const value = item[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}
