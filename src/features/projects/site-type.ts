import type { SiteType } from "./constructor";

export function normalizeSiteType(value: unknown): SiteType | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "_");

  if (["residential", "residence", "home", "house", "residential_property"].includes(normalized)) {
    return "RESIDENTIAL";
  }

  if (["commercial", "business", "commercial_property"].includes(normalized)) {
    return "COMMERCIAL";
  }

  return null;
}

export function isSiteType(value: unknown): value is SiteType {
  return value === "RESIDENTIAL" || value === "COMMERCIAL";
}
