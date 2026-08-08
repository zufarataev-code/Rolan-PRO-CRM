"use client";

import { useMemo, useState } from "react";
import type { PointerEvent } from "react";
import { useRouter } from "next/navigation";

type ConsultationSurveyWorkspaceProps = {
  consultation: any;
  referenceData: {
    complexity_levels: Array<{
      complexity_level_id: string;
      name_ru: string;
    }>;
    service_types: Array<{
      service_type_id: string;
      name_ru: string;
    }>;
    film_catalog: Array<{
      film_id: string;
      label: string;
    }>;
  };
};

type SurveyFormDraft = {
  summary_notes: string;
  electrical_notes: string;
  smart_recommended: boolean;
  solar_recommended: boolean;
  safety_recommended: boolean;
};

type MeasurementDraft = {
  room_name: string;
  office_name: string;
  zone_name: string;
  floor: string;
  window_id: string;
  width: string;
  height: string;
  sqft: string;
  quantity: string;
  glass_type: string;
  orientation: string;
  access_type: string;
  complexity_level_id: string;
  notes: string;
  drawing_data: MeasurementDrawingData | null;
  sort_order: string;
};

type RecommendationDraft = {
  measurement_id: string;
  service_type_id: string;
  film_id: string;
  is_primary: boolean;
  sort_order: string;
  recommendation_notes: string;
  electrical_notes: string;
};

type MeasurementSketchShape = {
  id: string;
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  width_in: number | null;
  height_in: number | null;
  sqft: number | null;
  quantity: number | null;
};

type MeasurementDrawingData = {
  version: 1;
  source: "survey_sketch";
  canvas: {
    width: number;
    height: number;
  };
  active_shape_id: string | null;
  shapes: MeasurementSketchShape[];
};

type SketchDragState = {
  id: string;
  startX: number;
  startY: number;
};

const SKETCH_CANVAS = {
  width: 1000,
  height: 620,
};

function createEmptyDrawingData(): MeasurementDrawingData {
  return {
    version: 1,
    source: "survey_sketch",
    canvas: SKETCH_CANVAS,
    active_shape_id: null,
    shapes: [],
  };
}

function normalizeDrawingData(value: unknown): MeasurementDrawingData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<MeasurementDrawingData>;
  const shapes = Array.isArray(raw.shapes)
    ? raw.shapes
        .filter((shape): shape is MeasurementSketchShape => {
          const candidate = shape as Partial<MeasurementSketchShape>;
          return (
            candidate.type === "rect" &&
            typeof candidate.id === "string" &&
            Number.isFinite(candidate.x) &&
            Number.isFinite(candidate.y) &&
            Number.isFinite(candidate.width) &&
            Number.isFinite(candidate.height)
          );
        })
        .map((shape) => ({
          id: shape.id,
          type: "rect" as const,
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
          label: shape.label || "Window",
          width_in: typeof shape.width_in === "number" && Number.isFinite(shape.width_in) ? shape.width_in : null,
          height_in: typeof shape.height_in === "number" && Number.isFinite(shape.height_in) ? shape.height_in : null,
          sqft: typeof shape.sqft === "number" && Number.isFinite(shape.sqft) ? shape.sqft : null,
          quantity: typeof shape.quantity === "number" && Number.isFinite(shape.quantity) ? shape.quantity : null,
        }))
    : [];

  return {
    version: 1,
    source: "survey_sketch",
    canvas: SKETCH_CANVAS,
    active_shape_id:
      typeof raw.active_shape_id === "string" && shapes.some((shape) => shape.id === raw.active_shape_id)
        ? raw.active_shape_id
        : shapes[0]?.id ?? null,
    shapes,
  };
}

function createSketchShape(id: string, x: number, y: number, label: string): MeasurementSketchShape {
  return {
    id,
    type: "rect",
    x,
    y,
    width: 0,
    height: 0,
    label,
    width_in: null,
    height_in: null,
    sqft: null,
    quantity: 1,
  };
}

function getActiveSketchShape(drawingData: MeasurementDrawingData | null) {
  if (!drawingData?.shapes.length) {
    return null;
  }

  return (
    drawingData.shapes.find((shape) => shape.id === drawingData.active_shape_id) ??
    drawingData.shapes[drawingData.shapes.length - 1]
  );
}

const GLASS_TYPE_OPTIONS = [
  { value: "single_pane", label: "Одинарное" },
  { value: "dual_pane", label: "Двойное" },
  { value: "tempered", label: "Закаленное" },
  { value: "laminated", label: "Ламинированное" },
  { value: "low_e", label: "Low-E" },
  { value: "unknown", label: "Неизвестно" },
];

const ORIENTATION_OPTIONS = [
  { value: "north", label: "Север" },
  { value: "south", label: "Юг" },
  { value: "east", label: "Восток" },
  { value: "west", label: "Запад" },
  { value: "north_west", label: "Северо-запад" },
  { value: "north_east", label: "Северо-восток" },
  { value: "south_west", label: "Юго-запад" },
  { value: "south_east", label: "Юго-восток" },
  { value: "mixed", label: "Смешанная сторона" },
];

const ACCESS_TYPE_OPTIONS = [
  { value: "inside", label: "Доступ изнутри" },
  { value: "outside", label: "Доступ снаружи" },
  { value: "ladder", label: "Нужна лестница" },
  { value: "lift", label: "Нужен подъемник" },
  { value: "limited", label: "Ограниченный доступ" },
];

function createSurveyFormDraft(consultation: any): SurveyFormDraft {
  return {
    summary_notes: consultation.survey?.summary_notes ?? "",
    electrical_notes: consultation.survey?.electrical_notes ?? "",
    smart_recommended: Boolean(consultation.survey?.smart_recommended),
    solar_recommended: Boolean(consultation.survey?.solar_recommended),
    safety_recommended: Boolean(consultation.survey?.safety_recommended),
  };
}

function createMeasurementDraft(measurement?: any): MeasurementDraft {
  return {
    room_name: measurement?.room_name ?? "",
    office_name: measurement?.office_name ?? "",
    zone_name: measurement?.zone_name ?? "",
    floor: measurement?.floor ?? "",
    window_id: measurement?.window_id ?? "",
    width: measurement?.width != null ? String(measurement.width) : "",
    height: measurement?.height != null ? String(measurement.height) : "",
    sqft: measurement?.sqft != null ? String(measurement.sqft) : "",
    quantity: measurement?.quantity != null ? String(measurement.quantity) : "1",
    glass_type: measurement?.glass_type ?? "",
    orientation: measurement?.orientation ?? "",
    access_type: measurement?.access_type ?? "",
    complexity_level_id: measurement?.complexity_level?.complexity_level_id ?? "",
    notes: measurement?.notes ?? "",
    drawing_data: normalizeDrawingData(measurement?.drawing_data),
    sort_order: measurement?.sort_order != null ? String(measurement.sort_order) : "0",
  };
}

function createRecommendationDraft(recommendation?: any): RecommendationDraft {
  return {
    measurement_id: recommendation?.measurement?.measurement_id ?? "",
    service_type_id: recommendation?.service_type?.service_type_id ?? "",
    film_id: recommendation?.film?.film_id ?? "",
    is_primary: Boolean(recommendation?.is_primary),
    sort_order: recommendation?.sort_order != null ? String(recommendation.sort_order) : "0",
    recommendation_notes: recommendation?.recommendation_notes ?? "",
    electrical_notes: recommendation?.electrical_notes ?? "",
  };
}

function measurementLabel(measurement: { room_name?: string | null; window_id?: string | null }) {
  const room = measurement.room_name?.trim() || "Без комнаты";
  const windowLabel = measurement.window_id?.trim();
  return windowLabel ? `${room} / ${windowLabel}` : room;
}

function computeSqft(widthValue: string, heightValue: string) {
  const width = Number(widthValue);
  const height = Number(heightValue);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const raw = (width * height) / 144;
  const rounded = Number(raw.toFixed(2));

  return {
    raw,
    rounded,
    label: rounded.toFixed(2),
  };
}

function computeTotalSqft(baseSqft: number | null | undefined, quantityValue: string | number | null | undefined) {
  const quantity =
    typeof quantityValue === "number"
      ? quantityValue
      : typeof quantityValue === "string" && quantityValue.trim()
        ? Number(quantityValue)
        : 1;

  if (!baseSqft || !Number.isFinite(baseSqft) || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return Number((baseSqft * quantity).toFixed(2));
}

function buildSelectableOptions(
  options: Array<{ value: string; label: string }>,
  currentValue: string | null | undefined,
) {
  if (!currentValue?.trim() || options.some((option) => option.value === currentValue)) {
    return options;
  }

  return [{ value: currentValue, label: `Текущее: ${currentValue}` }, ...options];
}

function toNullableNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDrawingDataForPayload(draft: MeasurementDraft, autoSqft: { rounded: number } | null) {
  const drawingData = normalizeDrawingData(draft.drawing_data);

  if (!drawingData?.shapes.length) {
    return null;
  }

  const activeShape = getActiveSketchShape(drawingData);
  const activeShapeId = activeShape?.id ?? drawingData.shapes[0]?.id ?? null;
  const widthIn = toNullableNumber(draft.width);
  const heightIn = toNullableNumber(draft.height);
  const sqft = toNullableNumber(draft.sqft) ?? autoSqft?.rounded ?? null;
  const quantity = toNullableNumber(draft.quantity) ?? 1;

  return {
    ...drawingData,
    active_shape_id: activeShapeId,
    shapes: drawingData.shapes.map((shape, index) =>
      shape.id === activeShapeId
        ? {
            ...shape,
            label: draft.window_id.trim() || shape.label || `W-${index + 1}`,
            width_in: widthIn,
            height_in: heightIn,
            sqft,
            quantity,
          }
        : shape,
    ),
  };
}

function formatInches(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "Без времени";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Без времени" : date.toLocaleString("ru-RU");
}

async function readApiJson(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | {
        errors?: Array<{
          message?: string;
        }>;
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message ?? "Request failed.");
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read file."));
    };
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function getSketchPoint(event: PointerEvent<SVGSVGElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * SKETCH_CANVAS.width;
  const y = ((event.clientY - rect.top) / rect.height) * SKETCH_CANVAS.height;

  return {
    x: Math.max(0, Math.min(SKETCH_CANVAS.width, x)),
    y: Math.max(0, Math.min(SKETCH_CANVAS.height, y)),
  };
}

function MeasurementSketchPad({
  value,
  onChange,
  windowLabel,
  widthIn,
  heightIn,
  sqft,
  quantity,
}: {
  value: MeasurementDrawingData | null;
  onChange: (drawingData: MeasurementDrawingData | null) => void;
  windowLabel: string;
  widthIn: number | null;
  heightIn: number | null;
  sqft: number | null;
  quantity: number | null;
}) {
  const [drag, setDrag] = useState<SketchDragState | null>(null);
  const drawingData = normalizeDrawingData(value) ?? createEmptyDrawingData();
  const activeShape = getActiveSketchShape(drawingData);
  const metricLabel =
    widthIn && heightIn ? `${formatInches(widthIn)} x ${formatInches(heightIn)} in` : "Размер не задан";
  const sqftLabel = sqft ? `${sqft.toFixed(2)} sqft` : "sqft auto";
  const shapeLabel = windowLabel.trim() || activeShape?.label || "Window";

  function updateShape(nextShape: MeasurementSketchShape) {
    const hasShape = drawingData.shapes.some((shape) => shape.id === nextShape.id);

    onChange({
      ...drawingData,
      active_shape_id: nextShape.id,
      shapes: hasShape
        ? drawingData.shapes.map((shape) => (shape.id === nextShape.id ? nextShape : shape))
        : [nextShape],
    });
  }

  return (
    <div className="measurement-sketch-shell">
      <div className="measurement-sketch-head">
        <div>
          <div className="row-title">Чертеж окна</div>
          <div className="row-meta">
            {metricLabel} • {sqftLabel} • qty {quantity || 1}
          </div>
        </div>
        <button type="button" className="soft-button" onClick={() => onChange(null)}>
          Очистить
        </button>
      </div>

      <svg
        className="measurement-sketch-canvas"
        viewBox={`0 0 ${SKETCH_CANVAS.width} ${SKETCH_CANVAS.height}`}
        aria-label="Window sketch canvas"
        onPointerDown={(event) => {
          const point = getSketchPoint(event);
          const id = `shape-${Date.now()}`;
          const nextShape = createSketchShape(id, point.x, point.y, shapeLabel);
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ id, startX: point.x, startY: point.y });
          onChange({
            ...drawingData,
            active_shape_id: id,
            shapes: [nextShape],
          });
        }}
        onPointerMove={(event) => {
          if (!drag) {
            return;
          }

          const point = getSketchPoint(event);
          const nextShape = createSketchShape(drag.id, Math.min(drag.startX, point.x), Math.min(drag.startY, point.y), shapeLabel);
          nextShape.width = Math.abs(point.x - drag.startX);
          nextShape.height = Math.abs(point.y - drag.startY);
          nextShape.width_in = widthIn;
          nextShape.height_in = heightIn;
          nextShape.sqft = sqft;
          nextShape.quantity = quantity || 1;
          updateShape(nextShape);
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <defs>
          <pattern id="measurementSketchGrid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(124, 167, 202, 0.2)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={SKETCH_CANVAS.width} height={SKETCH_CANVAS.height} rx="22" fill="url(#measurementSketchGrid)" />
        <rect
          x="24"
          y="24"
          width={SKETCH_CANVAS.width - 48}
          height={SKETCH_CANVAS.height - 48}
          rx="18"
          fill="transparent"
          stroke="rgba(124, 167, 202, 0.34)"
          strokeDasharray="14 12"
        />
        {drawingData.shapes.length ? (
          drawingData.shapes.map((shape) => {
            const labelX = Math.max(24, shape.x + 16);
            const labelY = Math.max(42, shape.y + 34);

            return (
              <g key={shape.id}>
                <rect
                  x={shape.x}
                  y={shape.y}
                  width={Math.max(1, shape.width)}
                  height={Math.max(1, shape.height)}
                  rx="10"
                  className="measurement-sketch-shape"
                />
                <text x={labelX} y={labelY} className="measurement-sketch-label">
                  {shapeLabel}
                </text>
                <text x={labelX} y={labelY + 24} className="measurement-sketch-meta">
                  {metricLabel} • {sqftLabel}
                </text>
              </g>
            );
          })
        ) : (
          <g>
            <text x="500" y="292" className="measurement-sketch-empty">
              Нарисуйте окно
            </text>
            <text x="500" y="324" className="measurement-sketch-empty-sub">
              CRM сохранит форму вместе с measurement
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function ConsultationSurveyWorkspace({
  consultation,
  referenceData,
}: ConsultationSurveyWorkspaceProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("Survey теперь можно редактировать прямо в рабочем окне замера.");
  const [surveyForm, setSurveyForm] = useState<SurveyFormDraft>(() => createSurveyFormDraft(consultation));
  const [measurementDrafts, setMeasurementDrafts] = useState<Record<string, MeasurementDraft>>(() =>
    Object.fromEntries(
      (consultation.survey?.measurements ?? []).map((measurement: any) => [
        measurement.measurement_id,
        createMeasurementDraft(measurement),
      ]),
    ),
  );
  const [newMeasurement, setNewMeasurement] = useState<MeasurementDraft>(() => createMeasurementDraft());
  const [recommendationDrafts, setRecommendationDrafts] = useState<Record<string, RecommendationDraft>>(() =>
    Object.fromEntries(
      (consultation.survey?.recommendations ?? []).map((recommendation: any) => [
        recommendation.survey_recommendation_id,
        createRecommendationDraft(recommendation),
      ]),
    ),
  );
  const [newRecommendation, setNewRecommendation] = useState<RecommendationDraft>(() => createRecommendationDraft());
  const [selectedPhotoMeasurementId, setSelectedPhotoMeasurementId] = useState("");
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [roomInputMode, setRoomInputMode] = useState<"existing" | "manual">("existing");

  const measurements = consultation.survey?.measurements ?? [];
  const recommendations = consultation.survey?.recommendations ?? [];
  const photos = consultation.survey?.photos ?? [];
  const surveyId = consultation.survey?.survey_id ?? null;

  const roomOptions = useMemo(() => {
    const uniqueRoomNames = Array.from<string>(
      new Set(
        measurements
          .map((measurement: any) => measurement.room_name?.trim())
          .filter((value: string | undefined): value is string => Boolean(value)),
      ),
    );

    return uniqueRoomNames.sort((left, right) => left.localeCompare(right, "ru"));
  }, [measurements]);

  const groupedMeasurements = useMemo(() => {
    const groups = new Map<
      string,
      {
        roomName: string;
        items: any[];
        windowUnits: number;
        totalSqft: number;
        photoCount: number;
      }
    >();

    measurements.forEach((measurement: any) => {
      const roomName = measurement.room_name?.trim() || "Без комнаты";
      const existing: {
        roomName: string;
        items: any[];
        windowUnits: number;
        totalSqft: number;
        photoCount: number;
      } = groups.get(roomName) ?? {
        roomName,
        items: [],
        windowUnits: 0,
        totalSqft: 0,
        photoCount: 0,
      };

      const measurementQuantity = Number(measurement.quantity ?? 1) || 1;
      existing.items.push(measurement);
      existing.windowUnits += measurementQuantity;
      existing.totalSqft += (Number(measurement.sqft ?? 0) || 0) * measurementQuantity;
      existing.photoCount += measurement.photos?.length ?? 0;
      groups.set(roomName, existing);
    });

    return Array.from(groups.values()).sort((left, right) => left.roomName.localeCompare(right.roomName, "ru"));
  }, [measurements]);

  const measurementOptions = useMemo<Array<{ value: string; label: string }>>(
    () =>
      measurements.map((measurement: any) => ({
        value: measurement.measurement_id,
        label: measurementLabel(measurement),
      })),
    [measurements],
  );

  const computedNewMeasurementSqft = useMemo(
    () => computeSqft(newMeasurement.width, newMeasurement.height),
    [newMeasurement.width, newMeasurement.height],
  );

  async function runMutation(
    action: string,
    runner: () => Promise<void>,
    successMessage: string,
  ) {
    setMessage(action);
    setIsSaving(true);

    try {
      await runner();
      setMessage(successMessage);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="detail-band">
      <section className="surface">
        <div className="detail-hero">
          <div>
            <div className="page-kicker mono">
              {consultation.deal?.deal_code ?? consultation.lead?.lead_code ?? "CONSULTATION"}
            </div>
            <h2 className="detail-heading">{consultation.title}</h2>
            <div className="detail-meta">
              <span>{consultation.client?.name ?? consultation.lead?.name ?? "Без клиента"}</span>
              <span>{consultation.location_address ?? "Адрес не указан"}</span>
              <span className="mono">{formatDateTime(consultation.scheduled_start_at)}</span>
            </div>
          </div>
          <div className="chip chip-success">{consultation.survey?.status ?? "draft"}</div>
        </div>
        <div className="row-meta" style={{ marginTop: 12 }}>
          {message}
        </div>
      </section>

      <section className="surface">
        <div className="calculator-addon-header">
          <div>
            <h3 className="surface-title">Survey form</h3>
            <div className="row-meta">Summary notes и service recommendation flags сохраняются через survey route.</div>
          </div>
          <button
            type="button"
            className="accent-button"
            disabled={isSaving}
            onClick={() =>
              void runMutation(
                "Сохраняю survey form...",
                async () => {
                  const response = await fetch(`/api/v1/consultations/${consultation.consultation_id}/survey`, {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(surveyForm),
                  });

                  await readApiJson(response);
                },
                "Survey form сохранен.",
              )
            }
          >
            Сохранить survey
          </button>
        </div>

        <div className="calculator-grid">
          <label className="calculator-checkbox-field">
            <input
              type="checkbox"
              checked={surveyForm.smart_recommended}
              onChange={(event) =>
                setSurveyForm((current) => ({
                  ...current,
                  smart_recommended: event.target.checked,
                }))
              }
            />
            <span>Smart recommended</span>
          </label>
          <label className="calculator-checkbox-field">
            <input
              type="checkbox"
              checked={surveyForm.solar_recommended}
              onChange={(event) =>
                setSurveyForm((current) => ({
                  ...current,
                  solar_recommended: event.target.checked,
                }))
              }
            />
            <span>Solar recommended</span>
          </label>
          <label className="calculator-checkbox-field">
            <input
              type="checkbox"
              checked={surveyForm.safety_recommended}
              onChange={(event) =>
                setSurveyForm((current) => ({
                  ...current,
                  safety_recommended: event.target.checked,
                }))
              }
            />
            <span>Safety recommended</span>
          </label>
        </div>

        <label className="calculator-notes">
          <span>Summary notes</span>
          <textarea
            rows={4}
            value={surveyForm.summary_notes}
            onChange={(event) =>
              setSurveyForm((current) => ({
                ...current,
                summary_notes: event.target.value,
              }))
            }
          />
        </label>

        <label className="calculator-notes">
          <span>Electrical notes</span>
          <textarea
            rows={3}
            value={surveyForm.electrical_notes}
            onChange={(event) =>
              setSurveyForm((current) => ({
                ...current,
                electrical_notes: event.target.value,
              }))
            }
          />
        </label>
      </section>

      <section className="surface">
        <div className="calculator-addon-header">
          <div>
            <h3 className="surface-title">Measurements</h3>
            <div className="row-meta">
              Замерщик работает по логике комната → окно → стекло → сторона → размеры → фото.
            </div>
          </div>
        </div>
        {groupedMeasurements.length ? (
          <div className="list-stack">
            {groupedMeasurements.map((room) => (
              <div key={room.roomName} className="inspector-item">
                <div className="row-title">{room.roomName}</div>
                <div className="row-meta">
                  {room.windowUnits} окон • {room.totalSqft.toFixed(2)} sqft • {room.photoCount} фото
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">Сначала добавьте первую комнату и окно.</div>
        )}

        <div className="surface" style={{ marginTop: 16 }}>
          <div className="calculator-addon-header">
            <div>
              <h4 className="surface-title">Новое окно / measurement</h4>
              <div className="row-meta">
                Можно выбрать существующую комнату или вручную добавить новую.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className={roomInputMode === "existing" ? "accent-button" : "soft-button"}
                disabled={!roomOptions.length}
                onClick={() => setRoomInputMode("existing")}
              >
                Выбрать комнату
              </button>
              <button
                type="button"
                className={roomInputMode === "manual" ? "accent-button" : "soft-button"}
                onClick={() => setRoomInputMode("manual")}
              >
                Новая комната
              </button>
              <button
                type="button"
                className="accent-button"
                disabled={isSaving || !newMeasurement.room_name.trim()}
                onClick={() =>
                  void runMutation(
                    "Добавляю measurement...",
                    async () => {
                      const response = await fetch(`/api/v1/consultations/${consultation.consultation_id}/measurements`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          room_name: newMeasurement.room_name,
                          office_name: newMeasurement.office_name || null,
                          zone_name: newMeasurement.zone_name || null,
                          floor: newMeasurement.floor || null,
                          window_id: newMeasurement.window_id || null,
                          width: toNullableNumber(newMeasurement.width),
                          height: toNullableNumber(newMeasurement.height),
                          sqft: toNullableNumber(newMeasurement.sqft) ?? computedNewMeasurementSqft?.rounded ?? null,
                          quantity: toNullableNumber(newMeasurement.quantity) ?? 1,
                          glass_type: newMeasurement.glass_type || null,
                          orientation: newMeasurement.orientation || null,
                          access_type: newMeasurement.access_type || null,
                          complexity_level_id: newMeasurement.complexity_level_id || null,
                          notes: newMeasurement.notes || null,
                          drawing_data: buildDrawingDataForPayload(newMeasurement, computedNewMeasurementSqft),
                          sort_order: Number(newMeasurement.sort_order || 0),
                        }),
                      });

                      await readApiJson(response);
                      setNewMeasurement(createMeasurementDraft());
                      setRoomInputMode(roomOptions.length ? "existing" : "manual");
                    },
                    "Measurement добавлен.",
                  )
                }
              >
                Добавить окно
              </button>
            </div>
          </div>

          <MeasurementSketchPad
            value={newMeasurement.drawing_data}
            onChange={(drawingData) =>
              setNewMeasurement((current) => ({
                ...current,
                drawing_data: drawingData,
              }))
            }
            windowLabel={newMeasurement.window_id || "Новое окно"}
            widthIn={toNullableNumber(newMeasurement.width)}
            heightIn={toNullableNumber(newMeasurement.height)}
            sqft={toNullableNumber(newMeasurement.sqft) ?? computedNewMeasurementSqft?.rounded ?? null}
            quantity={toNullableNumber(newMeasurement.quantity) ?? 1}
          />

          <div className="calculator-grid">
            {roomInputMode === "existing" && roomOptions.length ? (
              <label className="calculator-field">
                <span>Комната</span>
                <select
                  value={newMeasurement.room_name}
                  onChange={(event) =>
                    setNewMeasurement((current) => ({
                      ...current,
                      room_name: event.target.value,
                    }))
                  }
                >
                  <option value="">Выберите комнату</option>
                  {roomOptions.map((roomName) => (
                    <option key={roomName} value={roomName}>
                      {roomName}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="calculator-field">
                <span>Новая комната</span>
                <input
                  value={newMeasurement.room_name}
                  placeholder="Например: Lobby West / Conference Room A"
                  onChange={(event) =>
                    setNewMeasurement((current) => ({
                      ...current,
                      room_name: event.target.value,
                    }))
                  }
                />
              </label>
            )}

            <label className="calculator-field">
              <span>Этаж</span>
              <input
                value={newMeasurement.floor}
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    floor: event.target.value,
                  }))
                }
              />
            </label>

            <label className="calculator-field">
              <span>Окно</span>
              <input
                value={newMeasurement.window_id}
                placeholder="W-01"
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    window_id: event.target.value,
                  }))
                }
              />
            </label>

            <label className="calculator-field">
              <span>Количество окон</span>
              <input
                type="number"
                min="1"
                step="1"
                value={newMeasurement.quantity}
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
              />
            </label>

            <label className="calculator-field">
              <span>Зона / участок</span>
              <input
                value={newMeasurement.zone_name}
                placeholder="West facade / Lobby"
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    zone_name: event.target.value,
                  }))
                }
              />
            </label>

            <label className="calculator-field">
              <span>Ширина (in)</span>
              <input
                type="number"
                step="0.01"
                value={newMeasurement.width}
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    width: event.target.value,
                  }))
                }
              />
            </label>

            <label className="calculator-field">
              <span>Высота (in)</span>
              <input
                type="number"
                step="0.01"
                value={newMeasurement.height}
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    height: event.target.value,
                  }))
                }
              />
            </label>

            <label className="calculator-field">
              <span>Sqft override</span>
              <input
                type="number"
                step="0.01"
                value={newMeasurement.sqft}
                placeholder={computedNewMeasurementSqft?.label ?? "авто"}
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    sqft: event.target.value,
                  }))
                }
              />
            </label>

            <label className="calculator-field">
              <span>Тип стекла</span>
              <select
                value={newMeasurement.glass_type}
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    glass_type: event.target.value,
                  }))
                }
              >
                <option value="">Выберите тип стекла</option>
                {GLASS_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="calculator-field">
              <span>Сторона</span>
              <select
                value={newMeasurement.orientation}
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    orientation: event.target.value,
                  }))
                }
              >
                <option value="">Выберите сторону</option>
                {ORIENTATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="calculator-field">
              <span>Доступ</span>
              <select
                value={newMeasurement.access_type}
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    access_type: event.target.value,
                  }))
                }
              >
                <option value="">Выберите доступ</option>
                {ACCESS_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="calculator-field">
              <span>Complexity</span>
              <select
                value={newMeasurement.complexity_level_id}
                onChange={(event) =>
                  setNewMeasurement((current) => ({
                    ...current,
                    complexity_level_id: event.target.value,
                  }))
                }
              >
                <option value="">Без сложности</option>
                {referenceData.complexity_levels.map((level) => (
                  <option key={level.complexity_level_id} value={level.complexity_level_id}>
                    {level.name_ru}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="detail-meta" style={{ marginTop: 12 }}>
            <span>Авто sqft: {computedNewMeasurementSqft?.label ?? "—"}</span>
            <span>
              Total sqft:{" "}
              {computeTotalSqft(
                computedNewMeasurementSqft?.rounded ?? toNullableNumber(newMeasurement.sqft),
                newMeasurement.quantity,
              )?.toFixed(2) ?? "—"}
            </span>
            <span>Фото можно сразу привязать к этому окну в блоке Survey photos ниже.</span>
          </div>

          <label className="calculator-notes">
            <span>Notes</span>
            <textarea
              rows={3}
              value={newMeasurement.notes}
              onChange={(event) =>
                setNewMeasurement((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
        </div>

        {groupedMeasurements.length ? (
          <div className="list-stack" style={{ marginTop: 16 }}>
            {groupedMeasurements.map((room) => (
              <section key={room.roomName} className="surface">
                <div className="detail-hero">
                  <div>
                    <h4 className="surface-title">{room.roomName}</h4>
                    <p className="surface-subtitle">
                      {room.windowUnits} окон • {room.totalSqft.toFixed(2)} sqft • {room.photoCount} фото
                    </p>
                  </div>
                  <div className="chip chip-accent">Room total</div>
                </div>

                <div className="list-stack">
                  {room.items.map((measurement: any) => {
                    const draft = measurementDrafts[measurement.measurement_id] ?? createMeasurementDraft(measurement);
                    const computedDraftSqft = computeSqft(draft.width, draft.height);
                    const totalDraftSqft =
                      computeTotalSqft(
                        computedDraftSqft?.rounded ?? toNullableNumber(draft.sqft),
                        draft.quantity,
                      ) ?? null;
                    const glassOptions = buildSelectableOptions(GLASS_TYPE_OPTIONS, draft.glass_type);
                    const orientationOptions = buildSelectableOptions(ORIENTATION_OPTIONS, draft.orientation);
                    const accessOptions = buildSelectableOptions(ACCESS_TYPE_OPTIONS, draft.access_type);

                    return (
                      <article key={measurement.measurement_id} className="surface">
                        <div className="calculator-addon-header">
                          <div>
                            <div className="row-title">{measurementLabel(measurement)}</div>
                            <div className="row-meta">
                              {measurement.photos.length} фото • qty {draft.quantity || measurement.quantity || 1} • auto sqft{" "}
                              {computedDraftSqft?.label ?? measurement.sqft ?? "—"} • total {totalDraftSqft?.toFixed(2) ?? "—"}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="soft-button"
                            disabled={isSaving}
                            onClick={() =>
                              void runMutation(
                                "Сохраняю measurement...",
                                async () => {
                                  const response = await fetch(`/api/v1/measurements/${measurement.measurement_id}`, {
                                    method: "PATCH",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      room_name: draft.room_name,
                                      office_name: draft.office_name || null,
                                      zone_name: draft.zone_name || null,
                                      floor: draft.floor || null,
                                      window_id: draft.window_id || null,
                                      width: toNullableNumber(draft.width),
                                      height: toNullableNumber(draft.height),
                                      sqft: toNullableNumber(draft.sqft) ?? computedDraftSqft?.rounded ?? null,
                                      quantity: toNullableNumber(draft.quantity) ?? 1,
                                      glass_type: draft.glass_type || null,
                                      orientation: draft.orientation || null,
                          access_type: draft.access_type || null,
                          complexity_level_id: draft.complexity_level_id || null,
                          notes: draft.notes || null,
                          drawing_data: buildDrawingDataForPayload(draft, computedDraftSqft),
                          sort_order: Number(draft.sort_order || 0),
                        }),
                      });

                                  await readApiJson(response);
                                },
                                `Measurement ${draft.room_name || measurement.room_name} сохранен.`,
                              )
                            }
                          >
                            Сохранить
                          </button>
                        </div>

                        <MeasurementSketchPad
                          value={draft.drawing_data}
                          onChange={(drawingData) =>
                            setMeasurementDrafts((current) => ({
                              ...current,
                              [measurement.measurement_id]: {
                                ...draft,
                                drawing_data: drawingData,
                              },
                            }))
                          }
                          windowLabel={draft.window_id || measurement.window_id || measurementLabel(measurement)}
                          widthIn={toNullableNumber(draft.width)}
                          heightIn={toNullableNumber(draft.height)}
                          sqft={toNullableNumber(draft.sqft) ?? computedDraftSqft?.rounded ?? null}
                          quantity={toNullableNumber(draft.quantity) ?? 1}
                        />

                        <div className="calculator-grid">
                          <label className="calculator-field">
                            <span>Комната</span>
                            <input
                              value={draft.room_name}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    room_name: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="calculator-field">
                            <span>Этаж</span>
                            <input
                              value={draft.floor}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    floor: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="calculator-field">
                            <span>Окно</span>
                            <input
                              value={draft.window_id}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    window_id: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="calculator-field">
                            <span>Количество окон</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={draft.quantity}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    quantity: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="calculator-field">
                            <span>Зона</span>
                            <input
                              value={draft.zone_name}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    zone_name: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="calculator-field">
                            <span>Ширина</span>
                            <input
                              type="number"
                              step="0.01"
                              value={draft.width}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    width: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="calculator-field">
                            <span>Высота</span>
                            <input
                              type="number"
                              step="0.01"
                              value={draft.height}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    height: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="calculator-field">
                            <span>Sqft</span>
                            <input
                              type="number"
                              step="0.01"
                              value={draft.sqft}
                              placeholder={computedDraftSqft?.label ?? "авто"}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    sqft: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="calculator-field">
                            <span>Тип стекла</span>
                            <select
                              value={draft.glass_type}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    glass_type: event.target.value,
                                  },
                                }))
                              }
                            >
                              <option value="">Выберите тип стекла</option>
                              {glassOptions.map((option) => (
                                <option key={`${measurement.measurement_id}-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="calculator-field">
                            <span>Сторона</span>
                            <select
                              value={draft.orientation}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    orientation: event.target.value,
                                  },
                                }))
                              }
                            >
                              <option value="">Выберите сторону</option>
                              {orientationOptions.map((option) => (
                                <option key={`${measurement.measurement_id}-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="calculator-field">
                            <span>Доступ</span>
                            <select
                              value={draft.access_type}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    access_type: event.target.value,
                                  },
                                }))
                              }
                            >
                              <option value="">Выберите доступ</option>
                              {accessOptions.map((option) => (
                                <option key={`${measurement.measurement_id}-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="calculator-field">
                            <span>Complexity</span>
                            <select
                              value={draft.complexity_level_id}
                              onChange={(event) =>
                                setMeasurementDrafts((current) => ({
                                  ...current,
                                  [measurement.measurement_id]: {
                                    ...draft,
                                    complexity_level_id: event.target.value,
                                  },
                                }))
                              }
                            >
                              <option value="">Без сложности</option>
                              {referenceData.complexity_levels.map((level) => (
                                <option key={level.complexity_level_id} value={level.complexity_level_id}>
                                  {level.name_ru}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <label className="calculator-notes">
                          <span>Notes</span>
                          <textarea
                            rows={2}
                            value={draft.notes}
                            onChange={(event) =>
                              setMeasurementDrafts((current) => ({
                                ...current,
                                [measurement.measurement_id]: {
                                  ...draft,
                                  notes: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </section>

      <section className="surface">
        <div className="calculator-addon-header">
          <div>
            <h3 className="surface-title">Recommendations</h3>
            <div className="row-meta">Film recommendations теперь можно создавать и редактировать на месте.</div>
          </div>
          <button
            type="button"
            className="accent-button"
            disabled={isSaving}
            onClick={() =>
              void runMutation(
                "Добавляю recommendation...",
                async () => {
                  const response = await fetch(
                    `/api/v1/consultations/${consultation.consultation_id}/recommendations`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        measurement_id: newRecommendation.measurement_id || null,
                        service_type_id: newRecommendation.service_type_id,
                        film_id: newRecommendation.film_id || null,
                        is_primary: newRecommendation.is_primary,
                        sort_order: Number(newRecommendation.sort_order || 0),
                        recommendation_notes: newRecommendation.recommendation_notes || null,
                        electrical_notes: newRecommendation.electrical_notes || null,
                      }),
                    },
                  );

                  await readApiJson(response);
                  setNewRecommendation(createRecommendationDraft());
                },
                "Recommendation добавлена.",
              )
            }
          >
            Добавить recommendation
          </button>
        </div>

        <div className="calculator-grid">
          <label className="calculator-field">
            <span>Measurement</span>
            <select
              value={newRecommendation.measurement_id}
              onChange={(event) =>
                setNewRecommendation((current) => ({
                  ...current,
                  measurement_id: event.target.value,
                }))
              }
            >
              <option value="">Общая рекомендация</option>
              {measurementOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="calculator-field">
            <span>Service type</span>
            <select
              value={newRecommendation.service_type_id}
              onChange={(event) =>
                setNewRecommendation((current) => ({
                  ...current,
                  service_type_id: event.target.value,
                }))
              }
            >
              <option value="">Выберите сервис</option>
              {referenceData.service_types.map((serviceType) => (
                <option key={serviceType.service_type_id} value={serviceType.service_type_id}>
                  {serviceType.name_ru}
                </option>
              ))}
            </select>
          </label>
          <label className="calculator-field">
            <span>Film</span>
            <select
              value={newRecommendation.film_id}
              onChange={(event) =>
                setNewRecommendation((current) => ({
                  ...current,
                  film_id: event.target.value,
                }))
              }
            >
              <option value="">Без пленки</option>
              {referenceData.film_catalog.map((film) => (
                <option key={film.film_id} value={film.film_id}>
                  {film.label}
                </option>
              ))}
            </select>
          </label>
          <label className="calculator-checkbox-field">
            <input
              type="checkbox"
              checked={newRecommendation.is_primary}
              onChange={(event) =>
                setNewRecommendation((current) => ({
                  ...current,
                  is_primary: event.target.checked,
                }))
              }
            />
            <span>Primary recommendation</span>
          </label>
        </div>

        <label className="calculator-notes">
          <span>Recommendation notes</span>
          <textarea
            rows={2}
            value={newRecommendation.recommendation_notes}
            onChange={(event) =>
              setNewRecommendation((current) => ({
                ...current,
                recommendation_notes: event.target.value,
              }))
            }
          />
        </label>

        <div className="list-stack">
          {recommendations.length ? (
            recommendations.map((recommendation: any) => {
              const draft =
                recommendationDrafts[recommendation.survey_recommendation_id] ??
                createRecommendationDraft(recommendation);

              return (
                <div key={recommendation.survey_recommendation_id} className="surface">
                  <div className="calculator-addon-header">
                    <div>
                      <div className="row-title">{recommendation.service_type.name_ru}</div>
                      <div className="row-meta">
                        {recommendation.measurement?.room_name ?? "Общая рекомендация"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="soft-button"
                      disabled={isSaving}
                      onClick={() =>
                        void runMutation(
                          "Сохраняю recommendation...",
                          async () => {
                            const response = await fetch(
                              `/api/v1/survey-recommendations/${recommendation.survey_recommendation_id}`,
                              {
                                method: "PATCH",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  measurement_id: draft.measurement_id || null,
                                  service_type_id: draft.service_type_id,
                                  film_id: draft.film_id || null,
                                  is_primary: draft.is_primary,
                                  sort_order: Number(draft.sort_order || 0),
                                  recommendation_notes: draft.recommendation_notes || null,
                                  electrical_notes: draft.electrical_notes || null,
                                }),
                              },
                            );

                            await readApiJson(response);
                          },
                          "Recommendation сохранена.",
                        )
                      }
                    >
                      Сохранить
                    </button>
                  </div>

                  <div className="calculator-grid">
                    <label className="calculator-field">
                      <span>Measurement</span>
                      <select
                        value={draft.measurement_id}
                        onChange={(event) =>
                          setRecommendationDrafts((current) => ({
                            ...current,
                            [recommendation.survey_recommendation_id]: {
                              ...draft,
                              measurement_id: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="">Общая рекомендация</option>
                        {measurementOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="calculator-field">
                      <span>Service type</span>
                      <select
                        value={draft.service_type_id}
                        onChange={(event) =>
                          setRecommendationDrafts((current) => ({
                            ...current,
                            [recommendation.survey_recommendation_id]: {
                              ...draft,
                              service_type_id: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="">Выберите сервис</option>
                        {referenceData.service_types.map((serviceType) => (
                          <option key={serviceType.service_type_id} value={serviceType.service_type_id}>
                            {serviceType.name_ru}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="calculator-field">
                      <span>Film</span>
                      <select
                        value={draft.film_id}
                        onChange={(event) =>
                          setRecommendationDrafts((current) => ({
                            ...current,
                            [recommendation.survey_recommendation_id]: {
                              ...draft,
                              film_id: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="">Без пленки</option>
                        {referenceData.film_catalog.map((film) => (
                          <option key={film.film_id} value={film.film_id}>
                            {film.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="calculator-checkbox-field">
                      <input
                        type="checkbox"
                        checked={draft.is_primary}
                        onChange={(event) =>
                          setRecommendationDrafts((current) => ({
                            ...current,
                            [recommendation.survey_recommendation_id]: {
                              ...draft,
                              is_primary: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span>Primary</span>
                    </label>
                  </div>

                  <label className="calculator-notes">
                    <span>Recommendation notes</span>
                    <textarea
                      rows={2}
                      value={draft.recommendation_notes}
                      onChange={(event) =>
                        setRecommendationDrafts((current) => ({
                          ...current,
                          [recommendation.survey_recommendation_id]: {
                            ...draft,
                            recommendation_notes: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              );
            })
          ) : (
            <div className="empty-state">Рекомендации пока не добавлены.</div>
          )}
        </div>
      </section>

      <section className="surface">
        <div className="calculator-addon-header">
          <div>
            <h3 className="surface-title">Survey photos</h3>
            <div className="row-meta">MVP upload сохраняет фото через существующий photo route.</div>
          </div>
          <button
            type="button"
            className="accent-button"
            disabled={isSaving || !selectedPhotoFile}
            onClick={() =>
              void runMutation(
                "Загружаю photo...",
                async () => {
                  if (!selectedPhotoFile) {
                    throw new Error("Выберите файл для загрузки.");
                  }

                  const fileUrl = await readFileAsDataUrl(selectedPhotoFile);
                  const response = await fetch(`/api/v1/consultations/${consultation.consultation_id}/photos`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      survey_id: surveyId,
                      measurement_id: selectedPhotoMeasurementId || null,
                      file_type: "survey",
                      original_name: selectedPhotoFile.name,
                      file_url: fileUrl,
                      mime_type: selectedPhotoFile.type || null,
                      size_bytes: selectedPhotoFile.size,
                      storage_provider: "inline",
                      storage_bucket: null,
                      storage_key: `inline/${Date.now()}-${selectedPhotoFile.name}`,
                    }),
                  });

                  await readApiJson(response);
                  setSelectedPhotoFile(null);
                  setSelectedPhotoMeasurementId("");
                },
                "Фото добавлено в survey.",
              )
            }
          >
            Загрузить фото
          </button>
        </div>

        <div className="calculator-grid">
          <label className="calculator-field">
            <span>Привязать к measurement</span>
            <select
              value={selectedPhotoMeasurementId}
              onChange={(event) => setSelectedPhotoMeasurementId(event.target.value)}
            >
              <option value="">Общее фото survey</option>
              {measurementOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="calculator-field">
            <span>Файл</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setSelectedPhotoFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {photos.length ? (
          <div className="inspector-list">
            {photos.map((photo: any) => (
              <div key={photo.file_id} className="inspector-item">
                <div className="row-title">{photo.original_name}</div>
                <div className="row-meta">{photo.file_type}</div>
                <div className="row-meta mono">{photo.file_url.slice(0, 72)}...</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">Фото survey пока не загружены.</div>
        )}
      </section>

      <section className="surface">
        <div className="calculator-addon-header">
          <div>
            <h3 className="surface-title">Survey completion</h3>
            <div className="row-meta">После завершения данные сразу становятся видны менеджеру.</div>
          </div>
          <button
            type="button"
            className="accent-button"
            disabled={isSaving}
            onClick={() =>
              void runMutation(
                "Завершаю survey...",
                async () => {
                  const response = await fetch(`/api/v1/consultations/${consultation.consultation_id}/complete`, {
                    method: "POST",
                  });

                  await readApiJson(response);
                },
                "Survey завершен.",
              )
            }
          >
            Завершить survey
          </button>
        </div>
      </section>
    </div>
  );
}
