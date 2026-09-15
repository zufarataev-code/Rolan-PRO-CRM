import {
  GLASS_CONSTRUCTION_OPTIONS,
  GLASS_TREATMENT_OPTIONS,
  OPENING_TYPE_OPTIONS,
  type CustomerType,
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    opening_id: nullableString(value.opening_id),
    cell_id: nullableString(value.cell_id),
    opening_type: openingType,
    room_key: nullableString(value.room_key),
    room_number: nullableString(value.room_number),
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
    room_film_id: nullableString(value.room_film_id),
    opening_film_id: nullableString(value.opening_film_id),
    film_override_id: nullableString(value.film_override_id),
  };
}

export function isProjectConstructorUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export type ProjectConstructorPatchInput = {
  site_type?: SiteType;
  customer_type?: CustomerType;
  add_service_type_id?: string;
  position_updates: Array<{ position_id: string; film_id: string | null }>;
};

export function parseProjectConstructorPatch(value: unknown): ProjectConstructorPatchInput | null {
  if (!isRecord(value)) return null;

  const siteType = value.site_type === undefined ? undefined : parseSiteType(value.site_type);
  if (value.site_type !== undefined && !siteType) return null;

  const customerType = value.customer_type === undefined ? undefined : parseCustomerType(value.customer_type);
  if (value.customer_type !== undefined && !customerType) return null;

  const addServiceTypeId = value.add_service_type_id === undefined
    ? undefined
    : requiredUuid(value.add_service_type_id);
  if (value.add_service_type_id !== undefined && !addServiceTypeId) return null;

  const rawUpdates = value.position_updates === undefined ? [] : value.position_updates;
  if (!Array.isArray(rawUpdates)) return null;
  const positionUpdates: ProjectConstructorPatchInput["position_updates"] = [];
  for (const update of rawUpdates) {
    if (!isRecord(update)) return null;
    const positionId = requiredUuid(update.position_id);
    const filmId = update.film_id === null ? null : requiredUuid(update.film_id);
    if (!positionId || (update.film_id !== null && !filmId)) return null;
    positionUpdates.push({ position_id: positionId, film_id: filmId });
  }

  if (!siteType && !customerType && !addServiceTypeId && positionUpdates.length === 0) return null;
  return {
    site_type: siteType ?? undefined,
    customer_type: customerType ?? undefined,
    add_service_type_id: addServiceTypeId ?? undefined,
    position_updates: positionUpdates,
  };
}

export type OpeningMeasurementInput = {
  project_position_id: string;
  site_type: SiteType;
  source: MeasurementSource;
  room_key: string;
  room_name: string;
  room_number: string | null;
  room_film_id: string | null;
  opening_id: string;
  opening_type: OpeningType;
  opening_film_id: string | null;
  overall_width: number;
  overall_height: number;
  orientation: string | null;
  glass: NonNullable<MeasurementConstructorInput["glass"]>;
  cells: Array<{
    cell_id: string;
    width: number;
    height: number;
    quantity: number;
    removal_required: boolean;
    film_override_id: string | null;
    supersedes_measurement_id: string | null;
  }>;
};

export function parseOpeningMeasurementInput(value: unknown): OpeningMeasurementInput | null {
  if (!isRecord(value)) return null;
  const projectPositionId = requiredUuid(value.project_position_id);
  const siteType = parseSiteType(value.site_type);
  const source = parseMeasurementSource(value.source);
  const roomKey = requiredKey(value.room_key, 80);
  const roomName = requiredShortString(value.room_name, 160);
  const openingId = requiredKey(value.opening_id, 80);
  const openingType = typeof value.opening_type === "string" && OPENING_TYPES.has(value.opening_type as OpeningType)
    ? (value.opening_type as OpeningType)
    : null;
  const overallWidth = positiveNumber(value.overall_width);
  const overallHeight = positiveNumber(value.overall_height);
  const glassValue = isRecord(value.glass) ? value.glass : {};
  const construction = typeof glassValue.construction === "string"
    && GLASS_CONSTRUCTIONS.has(glassValue.construction as GlassConstruction)
    ? (glassValue.construction as GlassConstruction)
    : "unknown";
  const treatment = typeof glassValue.treatment === "string"
    && GLASS_TREATMENTS.has(glassValue.treatment as GlassTreatment)
    ? (glassValue.treatment as GlassTreatment)
    : "unknown";

  if (!projectPositionId || !siteType || !source || !roomKey || !roomName || !openingId || !openingType) return null;
  if (overallWidth === null || overallHeight === null) return null;

  const rawCells = Array.isArray(value.cells) ? value.cells : [];
  if (rawCells.length > 200) return null;
  const cells: OpeningMeasurementInput["cells"] = [];
  for (const rawCell of rawCells) {
    if (!isRecord(rawCell)) return null;
    const cellId = requiredKey(rawCell.cell_id, 80);
    const width = positiveNumber(rawCell.width);
    const height = positiveNumber(rawCell.height);
    const quantity = rawCell.quantity === undefined ? 1 : positiveNumber(rawCell.quantity);
    const filmOverrideId = nullableUuid(rawCell.film_override_id);
    const supersedesMeasurementId = nullableUuid(rawCell.supersedes_measurement_id);
    if (!cellId || width === null || height === null || quantity === null) return null;
    if (rawCell.film_override_id != null && !filmOverrideId) return null;
    if (rawCell.supersedes_measurement_id != null && !supersedesMeasurementId) return null;
    cells.push({
      cell_id: cellId,
      width,
      height,
      quantity,
      removal_required: rawCell.removal_required === true,
      film_override_id: filmOverrideId,
      supersedes_measurement_id: supersedesMeasurementId,
    });
  }

  const isFrench = openingType === "french_window" || openingType === "french_door";
  if (isFrench && cells.length === 0) return null;
  if (!isFrench && cells.length === 0) {
    cells.push({
      cell_id: `${openingId}-cell-1`,
      width: overallWidth,
      height: overallHeight,
      quantity: 1,
      removal_required: false,
      film_override_id: null,
      supersedes_measurement_id: null,
    });
  }
  if (new Set(cells.map((cell) => cell.cell_id)).size !== cells.length) return null;

  const roomFilmId = nullableUuid(value.room_film_id);
  const openingFilmId = nullableUuid(value.opening_film_id);
  if (value.room_film_id != null && !roomFilmId) return null;
  if (value.opening_film_id != null && !openingFilmId) return null;

  return {
    project_position_id: projectPositionId,
    site_type: siteType,
    source,
    room_key: roomKey,
    room_name: roomName,
    room_number: nullableShortString(value.room_number, 40),
    room_film_id: roomFilmId,
    opening_id: openingId,
    opening_type: openingType,
    opening_film_id: openingFilmId,
    overall_width: overallWidth,
    overall_height: overallHeight,
    orientation: nullableShortString(value.orientation, 40),
    glass: {
      construction,
      treatment,
      low_e: glassValue.low_e === true,
      low_e_position: nullableShortString(glassValue.low_e_position, 40),
      laminated: glassValue.laminated === true,
      tinted: glassValue.tinted === true,
    },
    cells,
  };
}

function parseSiteType(value: unknown): SiteType | null {
  if (value === "RESIDENTIAL" || value === "residential") return "RESIDENTIAL";
  if (value === "COMMERCIAL" || value === "commercial") return "COMMERCIAL";
  return null;
}

function parseMeasurementSource(value: unknown): MeasurementSource | null {
  if (value === "CUSTOMER" || value === "customer") return "CUSTOMER";
  if (value === "SURVEYOR_VERIFIED" || value === "surveyor") return "SURVEYOR_VERIFIED";
  return null;
}

function parseCustomerType(value: unknown): CustomerType | null {
  return value === "B2C" || value === "B2B" ? value : null;
}

function nullableString(value: unknown) {
  if (value == null) return null;
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown) {
  if (value == null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function requiredShortString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function requiredKey(value: unknown, maxLength: number) {
  const normalized = requiredShortString(value, maxLength);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function nullableShortString(value: unknown, maxLength: number) {
  if (value == null || value === "") return null;
  return requiredShortString(value, maxLength);
}

function requiredUuid(value: unknown) {
  return isProjectConstructorUuid(value) ? value : null;
}

function nullableUuid(value: unknown) {
  if (value == null || value === "") return null;
  return requiredUuid(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
