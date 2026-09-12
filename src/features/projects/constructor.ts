export type SiteType = "residential" | "commercial";
export type MeasurementSource = "customer" | "surveyor";
export type MeasurementVerificationStatus = "unverified" | "verified";
export type OpeningType =
  | "standard_window"
  | "standard_door"
  | "french_window"
  | "french_door"
  | "storefront"
  | "skylight"
  | "custom";
export type GlassConstruction = "single_pane" | "double_pane_igu" | "triple_pane_igu" | "unknown";
export type GlassTreatment = "annealed" | "heat_strengthened" | "tempered" | "unknown";
export type SolarCompatibilityStatus = "ok" | "review" | "not_recommended";

export type SelectOption<T extends string> = {
  value: T;
  label_ru: string;
  label_en: string;
};

export const SITE_TYPE_OPTIONS: SelectOption<SiteType>[] = [
  { value: "residential", label_ru: "Жилой объект", label_en: "Residential" },
  { value: "commercial", label_ru: "Коммерческий объект", label_en: "Commercial" },
];

export const ROOM_TEMPLATES: Record<SiteType, Array<{ key: string; label_ru: string; label_en: string }>> = {
  residential: [
    { key: "living_room", label_ru: "Гостиная", label_en: "Living Room" },
    { key: "bedroom", label_ru: "Спальня", label_en: "Bedroom" },
    { key: "kitchen", label_ru: "Кухня", label_en: "Kitchen" },
    { key: "bathroom", label_ru: "Ванная", label_en: "Bathroom" },
    { key: "dining_room", label_ru: "Столовая", label_en: "Dining Room" },
    { key: "office", label_ru: "Кабинет", label_en: "Office" },
    { key: "garage", label_ru: "Гараж", label_en: "Garage" },
    { key: "hallway", label_ru: "Коридор", label_en: "Hallway" },
    { key: "entry", label_ru: "Входная зона", label_en: "Entry" },
    { key: "custom", label_ru: "Другое", label_en: "Custom" },
  ],
  commercial: [
    { key: "office", label_ru: "Офис", label_en: "Office" },
    { key: "conference_room", label_ru: "Переговорная", label_en: "Conference Room" },
    { key: "lobby", label_ru: "Лобби / ресепшен", label_en: "Lobby / Reception" },
    { key: "storefront", label_ru: "Витрина", label_en: "Storefront" },
    { key: "corridor", label_ru: "Коридор", label_en: "Corridor" },
    { key: "break_room", label_ru: "Комната отдыха", label_en: "Break Room" },
    { key: "technical_room", label_ru: "Техническое помещение", label_en: "Technical / Utility Room" },
    { key: "warehouse_area", label_ru: "Складская зона", label_en: "Warehouse Area" },
    { key: "custom", label_ru: "Другое", label_en: "Custom" },
  ],
};

export const OPENING_TYPE_OPTIONS: SelectOption<OpeningType>[] = [
  { value: "standard_window", label_ru: "Окно", label_en: "Window" },
  { value: "standard_door", label_ru: "Стеклянная дверь", label_en: "Glass Door" },
  { value: "french_window", label_ru: "Французское окно", label_en: "French Window" },
  { value: "french_door", label_ru: "Французская дверь", label_en: "French Door" },
  { value: "storefront", label_ru: "Витрина", label_en: "Storefront" },
  { value: "skylight", label_ru: "Мансардное окно", label_en: "Skylight" },
  { value: "custom", label_ru: "Другое", label_en: "Custom" },
];

export const GLASS_CONSTRUCTION_OPTIONS: SelectOption<GlassConstruction>[] = [
  { value: "single_pane", label_ru: "Одинарное стекло", label_en: "Single Pane" },
  { value: "double_pane_igu", label_ru: "Двухстекольный стеклопакет", label_en: "Double Pane IGU" },
  { value: "triple_pane_igu", label_ru: "Трёхстекольный стеклопакет", label_en: "Triple Pane IGU" },
  { value: "unknown", label_ru: "Неизвестно", label_en: "Unknown" },
];

export const GLASS_TREATMENT_OPTIONS: SelectOption<GlassTreatment>[] = [
  { value: "annealed", label_ru: "Сырое", label_en: "Annealed" },
  { value: "heat_strengthened", label_ru: "Термоупрочнённое", label_en: "Heat-Strengthened" },
  { value: "tempered", label_ru: "Закалённое", label_en: "Tempered" },
  { value: "unknown", label_ru: "Неизвестно", label_en: "Unknown" },
];

export const SAFETY_FILM_CLASSES = [
  { code: "A1", thickness_mil: 8, label_ru: "A1 — 8 mil", label_en: "A1 — 8 mil" },
  { code: "A2", thickness_mil: 14, label_ru: "A2 — 14 mil", label_en: "A2 — 14 mil" },
  { code: "A3", thickness_mil: 24, label_ru: "A3 — 24 mil", label_en: "A3 — 24 mil" },
  { code: "ANTI_GRAFFITI", thickness_mil: null, label_ru: "Антивандальная / Anti-Graffiti", label_en: "Anti-Graffiti" },
] as const;

export type MeasurementConstructorInput = {
  site_type: SiteType;
  source: MeasurementSource;
  opening_type?: OpeningType;
  room_key?: string | null;
  overall_width?: number | null;
  overall_height?: number | null;
  pane_index?: number | null;
  removal_required?: boolean;
  glass?: {
    construction?: GlassConstruction;
    treatment?: GlassTreatment;
    low_e?: boolean;
    low_e_position?: string | null;
    laminated?: boolean;
    tinted?: boolean;
  };
  film_override_id?: string | null;
};

export type MeasurementConstructorDataV1 = {
  version: 1;
  site_type: SiteType;
  source: MeasurementSource;
  verification_status: MeasurementVerificationStatus;
  opening_type: OpeningType;
  room_key: string | null;
  overall_width: number | null;
  overall_height: number | null;
  pane_index: number | null;
  removal_required: boolean;
  glass: {
    construction: GlassConstruction;
    treatment: GlassTreatment;
    low_e: boolean;
    low_e_position: string | null;
    laminated: boolean;
    tinted: boolean;
  };
  film_override_id: string | null;
};

export function roomTemplatesForSite(siteType: SiteType) {
  return ROOM_TEMPLATES[siteType];
}

export function verificationStatusForSource(source: MeasurementSource): MeasurementVerificationStatus {
  return source === "surveyor" ? "verified" : "unverified";
}

export function buildMeasurementConstructorData(input: MeasurementConstructorInput): MeasurementConstructorDataV1 {
  return {
    version: 1,
    site_type: input.site_type,
    source: input.source,
    verification_status: verificationStatusForSource(input.source),
    opening_type: input.opening_type ?? "standard_window",
    room_key: input.room_key?.trim() || null,
    overall_width: finitePositiveOrNull(input.overall_width),
    overall_height: finitePositiveOrNull(input.overall_height),
    pane_index: finitePositiveIntegerOrNull(input.pane_index),
    removal_required: Boolean(input.removal_required),
    glass: {
      construction: input.glass?.construction ?? "unknown",
      treatment: input.glass?.treatment ?? "unknown",
      low_e: Boolean(input.glass?.low_e),
      low_e_position: input.glass?.low_e_position?.trim() || null,
      laminated: Boolean(input.glass?.laminated),
      tinted: Boolean(input.glass?.tinted),
    },
    film_override_id: input.film_override_id?.trim() || null,
  };
}

export function withMeasurementConstructorData(
  drawingData: unknown,
  input: MeasurementConstructorInput,
): Record<string, unknown> {
  const base = isPlainObject(drawingData)
    ? { ...drawingData }
    : drawingData == null
      ? {}
      : { legacy_drawing_data: drawingData };

  return {
    ...base,
    constructor_v1: buildMeasurementConstructorData(input),
  };
}

export function parseMeasurementConstructorData(drawingData: unknown): MeasurementConstructorDataV1 | null {
  if (!isPlainObject(drawingData) || !isPlainObject(drawingData.constructor_v1)) {
    return null;
  }

  const raw = drawingData.constructor_v1;
  if (raw.version !== 1 || (raw.site_type !== "residential" && raw.site_type !== "commercial")) {
    return null;
  }
  if (raw.source !== "customer" && raw.source !== "surveyor") {
    return null;
  }

  return buildMeasurementConstructorData({
    site_type: raw.site_type,
    source: raw.source,
    opening_type: isOpeningType(raw.opening_type) ? raw.opening_type : "standard_window",
    room_key: stringOrNull(raw.room_key),
    overall_width: numberOrNull(raw.overall_width),
    overall_height: numberOrNull(raw.overall_height),
    pane_index: numberOrNull(raw.pane_index),
    removal_required: Boolean(raw.removal_required),
    glass: isPlainObject(raw.glass)
      ? {
          construction: isGlassConstruction(raw.glass.construction) ? raw.glass.construction : "unknown",
          treatment: isGlassTreatment(raw.glass.treatment) ? raw.glass.treatment : "unknown",
          low_e: Boolean(raw.glass.low_e),
          low_e_position: stringOrNull(raw.glass.low_e_position),
          laminated: Boolean(raw.glass.laminated),
          tinted: Boolean(raw.glass.tinted),
        }
      : undefined,
    film_override_id: stringOrNull(raw.film_override_id),
  });
}

export type FilmInheritanceInput = {
  project_film_id?: string | null;
  room_film_id?: string | null;
  opening_film_id?: string | null;
  pane_film_id?: string | null;
};

export function resolveEffectiveFilm(input: FilmInheritanceInput) {
  const levels = [
    ["pane", input.pane_film_id],
    ["opening", input.opening_film_id],
    ["room", input.room_film_id],
    ["project", input.project_film_id],
  ] as const;

  for (const [source, filmId] of levels) {
    const normalized = filmId?.trim();
    if (normalized) {
      return { film_id: normalized, source } as const;
    }
  }

  return { film_id: null, source: "none" as const };
}

export type PaneAreaInput = {
  width?: number | null;
  height?: number | null;
  quantity?: number | null;
  removal_required?: boolean;
};

export function calculatePaneSqft(input: PaneAreaInput) {
  const width = finitePositiveOrNull(input.width);
  const height = finitePositiveOrNull(input.height);
  if (width == null || height == null) return 0;

  const quantity = finitePositiveOrNull(input.quantity) ?? 1;
  return round2((width * height * quantity) / 144);
}

export function calculateRemovalSqft(panes: PaneAreaInput[]) {
  return round2(
    panes.reduce((total, pane) => total + (pane.removal_required ? calculatePaneSqft(pane) : 0), 0),
  );
}

export type SolarCompatibilityInput = {
  allowed_glass_types?: unknown;
  restricted_orientations?: unknown;
  requires_review?: boolean;
  selection_note_ru?: string | null;
  orientation?: string | null;
  opening_type?: OpeningType;
  glass?: MeasurementConstructorDataV1["glass"];
};

export type SolarCompatibilityResult = {
  status: SolarCompatibilityStatus;
  reason_codes: string[];
  note_ru: string | null;
};

export function evaluateSolarCompatibility(input: SolarCompatibilityInput): SolarCompatibilityResult {
  const reasons: string[] = [];
  const orientation = input.orientation?.trim().toLowerCase() || null;
  const restricted = stringArray(input.restricted_orientations).map((value) => value.toLowerCase());

  if (orientation && restricted.includes(orientation)) {
    reasons.push("restricted_orientation");
  }

  const glass = input.glass;
  const glassUnknown = !glass || glass.construction === "unknown" || glass.treatment === "unknown";
  const allowed = stringArray(input.allowed_glass_types);
  if (allowed.length > 0 && glass && !glassUnknown) {
    const keys = glassCompatibilityKeys(glass, input.opening_type);
    if (!keys.some((key) => allowed.includes(key))) {
      reasons.push("glass_not_allowed");
    }
  }

  if (reasons.includes("restricted_orientation") || reasons.includes("glass_not_allowed")) {
    return {
      status: "not_recommended",
      reason_codes: reasons,
      note_ru: input.selection_note_ru?.trim() || null,
    };
  }

  if (glassUnknown) reasons.push("glass_unknown");
  if (input.requires_review) reasons.push("film_requires_review");

  return {
    status: reasons.length > 0 ? "review" : "ok",
    reason_codes: reasons,
    note_ru: input.selection_note_ru?.trim() || null,
  };
}

export function glassCompatibilityKeys(
  glass: MeasurementConstructorDataV1["glass"],
  openingType?: OpeningType,
) {
  const keys = new Set<string>();
  if (glass.construction === "single_pane") {
    if (glass.treatment === "tempered") keys.add("single_tempered");
    if (glass.treatment === "annealed") keys.add("single_annealed");
    keys.add("single_pane");
  }
  if (glass.construction === "double_pane_igu") keys.add("dual_pane");
  if (glass.construction === "triple_pane_igu") keys.add("triple_pane");
  if (glass.low_e) keys.add("low_e");
  if (glass.laminated) keys.add("laminated");
  if (glass.tinted) keys.add("tinted_glass");
  if (openingType === "skylight") keys.add("skylight");
  if (openingType === "storefront" || openingType === "french_window" || openingType === "french_door") {
    keys.add("panoramic");
  }
  return [...keys];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finitePositiveOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function finitePositiveIntegerOrNull(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isOpeningType(value: unknown): value is OpeningType {
  return [
    "standard_window",
    "standard_door",
    "french_window",
    "french_door",
    "storefront",
    "skylight",
    "custom",
  ].includes(String(value));
}

function isGlassConstruction(value: unknown): value is GlassConstruction {
  return ["single_pane", "double_pane_igu", "triple_pane_igu", "unknown"].includes(String(value));
}

function isGlassTreatment(value: unknown): value is GlassTreatment {
  return ["annealed", "heat_strengthened", "tempered", "unknown"].includes(String(value));
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
