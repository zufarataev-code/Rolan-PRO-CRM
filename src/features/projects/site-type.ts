import type { SiteType } from "./constructor";

export function normalizeSiteType(value: unknown): SiteType | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "_");

  if (["residential", "residence", "home", "house", "residential_property"].includes(normalized)) {
    return "residential";
  }

  if (["commercial", "business", "commercial_property"].includes(normalized)) {
    return "commercial";
  }

  return null;
}

export function isSiteType(value: unknown): value is SiteType {
  return value === "residential" || value === "commercial";
}
