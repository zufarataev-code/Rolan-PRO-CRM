/**
 * Проём → стёкла для раскроя.
 *
 * Двухстворчатое окно 72×48 — это два стекла 36×48, французское — сетка.
 * Раскрой считается по стёклам, а не по проёму: это даёт честный расход
 * плёнки и метки на кусках «Г1.2» (комната · окно · стекло), по которым
 * монтажник находит кусок в наряде. Сам раскрой делает calculateCuttingPlan.
 */

import { calculateCuttingPlan } from "./logic";
import type { CuttingPlan, CuttingPlanOptions, MeasurementPanelInput } from "./types";

export type SashLayoutCode =
  | "single"
  | "double_sash"
  | "triple_sash"
  | "slider"
  | "panoramic"
  | "french_grid"
  | "door"
  | "transom"
  | "skylight"
  | "storefront";

export type SashLayout = { cols: number; rows: number };

export const SASH_LAYOUT_OPTIONS: Array<{ value: SashLayoutCode; label_ru: string; label_en: string; layout: SashLayout }> = [
  { value: "single", label_ru: "Одностворчатое", label_en: "Single sash", layout: { cols: 1, rows: 1 } },
  { value: "double_sash", label_ru: "Двухстворчатое", label_en: "Double sash", layout: { cols: 2, rows: 1 } },
  { value: "triple_sash", label_ru: "Трёхстворчатое", label_en: "Triple sash", layout: { cols: 3, rows: 1 } },
  { value: "slider", label_ru: "Раздвижное", label_en: "Slider", layout: { cols: 2, rows: 1 } },
  { value: "panoramic", label_ru: "Панорамное", label_en: "Panoramic", layout: { cols: 1, rows: 1 } },
  { value: "french_grid", label_ru: "Французское (сетка)", label_en: "French grid", layout: { cols: 2, rows: 3 } },
  { value: "door", label_ru: "Дверь", label_en: "Door", layout: { cols: 1, rows: 1 } },
  { value: "transom", label_ru: "Фрамуга", label_en: "Transom", layout: { cols: 1, rows: 1 } },
  { value: "skylight", label_ru: "Skylight", label_en: "Skylight", layout: { cols: 1, rows: 1 } },
  { value: "storefront", label_ru: "Витрина", label_en: "Storefront", layout: { cols: 1, rows: 1 } },
];

export function sashLayoutFor(code: string | null | undefined, override?: Partial<SashLayout> | null): SashLayout {
  const preset = SASH_LAYOUT_OPTIONS.find((option) => option.value === code)?.layout ?? { cols: 1, rows: 1 };
  const cols = Math.max(1, Math.floor(override?.cols ?? preset.cols));
  const rows = Math.max(1, Math.floor(override?.rows ?? preset.rows));
  return { cols, rows };
}

export type OpeningForCutting = {
  key: string;
  room_name?: string | null;
  window_name?: string | null;
  width_in: number;
  height_in: number;
  quantity?: number | null;
  sash_layout_code?: string | null;
  sash_cols?: number | null;
  sash_rows?: number | null;
};

/** Один проём → панели для calculateCuttingPlan, по одной на каждое стекло. */
export function openingToPanels(opening: OpeningForCutting): MeasurementPanelInput[] {
  const layout = sashLayoutFor(opening.sash_layout_code, { cols: opening.sash_cols ?? undefined, rows: opening.sash_rows ?? undefined });
  const quantity = Math.max(1, Math.floor(opening.quantity ?? 1));
  const paneWidth = opening.width_in / layout.cols;
  const paneHeight = opening.height_in / layout.rows;
  const perOpening = layout.cols * layout.rows;
  const panels: MeasurementPanelInput[] = [];
  for (let q = 0; q < quantity; q += 1) {
    for (let i = 0; i < perOpening; i += 1) {
      const paneNumber = q * perOpening + i + 1;
      const suffix = perOpening * quantity > 1 ? `.${paneNumber}` : "";
      panels.push({
        id: `${opening.key}${suffix}`,
        roomName: opening.room_name ?? null,
        windowName: opening.window_name ?? null,
        label: `${opening.key}${suffix}`,
        glassWidthIn: round1(paneWidth),
        glassHeightIn: round1(paneHeight),
        quantity: 1,
        allowRotation: true,
      });
    }
  }
  return panels;
}

export function cuttingPlanForOpenings(openings: OpeningForCutting[], options: CuttingPlanOptions = {}): CuttingPlan | null {
  const panels = openings.flatMap(openingToPanels).filter((panel) => panel.glassWidthIn > 0 && panel.glassHeightIn > 0);
  if (panels.length === 0) return null;
  return calculateCuttingPlan(panels, options);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
