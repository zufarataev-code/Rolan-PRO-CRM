import {
  GLASS_CONSTRUCTION_OPTIONS,
  GLASS_TREATMENT_OPTIONS,
  OPENING_TYPE_OPTIONS,
  type GlassConstruction,
  type GlassTreatment,
  type MeasurementConstructorInput,
  type MeasurementSource,
  type OpeningType,
  type SiteType,
} from "./constructor";

const OPENING_TYPES = new Set<OpeningType>(OPENING_TYPE_OPTIONS.map((option) => option.value));
const GLASS_CONSTRUCTIONS = new Set<GlassConstruction>(
  GLASS_CONSTRUCTION_OPTIONS.map((option) => option.value),
);
const GLASS_TREATMENTS = new Set<GlassTreatment>(GLASS_TREATMENT_OPTIONS.map((option) => option.value));

export function parseMeasurementConstructorInput(value: unknown): MeasurementConstructorInput | null {
  if (!isRecord(value)) return null;

  const siteType = parseSiteType(value.site_type);
  const source = parseMeasurementSource(value.source);
  if (!siteType || !source) return null;

  const openingType = typeof value.opening_type === "string" && OPENING_TYPES.has(value.opening_type as OpeningType)
    ? (value.opening_type as OpeningType)
    : undefined;

  const glassValue = isRecord(value.glass) ? value.glass : null;
  const construction =
    typeof glassValue?.construction === "string" && GLASS_CONSTRUCTIONS.has(glassValue.construction as GlassConstruction)
      ? (glassValue.construction as GlassConstruction)
      : undefined;
  const treatment =
    typeof glassValue?.treatment === "string" && GLASS_TREATMENTS.has(glassValue.treatment as GlassTreatment)
      ? (glassValue.treatment as GlassTreatment)
      : undefined;

  return {
    site_type: siteType,
    source,
    opening_type: openingType,
    room_key: nullableString(value.room_key),
    overall_width: nullableNumber(value.overall_width),
    overall_height: nullableNumber(value.overall_height),
    pane_index: nullableNumber(value.pane_index),
    removal_required: typeof value.removal_required === "boolean" ? value.removal_required : undefined,
    glass: glassValue
      ? {
          construction,
          treatment,
          low_e: typeof glassValue.low_e === "boolean" ? glassValue.low_e : undefined,
          low_e_position: nullableString(glassValue.low_e_position),
          laminated: typeof glassValue.laminated === "boolean" ? glassValue.laminated : undefined,
          tinted: typeof glassValue.tinted === "boolean" ? glassValue.tinted : undefined,
        }
      : undefined,
    film_override_id: nullableString(value.film_override_id),
  };
}

function parseSiteType(value: unknown): SiteType | null {
  return value === "residential" || value === "commercial" ? value : null;
}

function parseMeasurementSource(value: unknown): MeasurementSource | null {
  return value === "customer" || value === "surveyor" ? value : null;
}

function nullableString(value: unknown) {
  if (value == null) return null;
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown) {
  if (value == null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
