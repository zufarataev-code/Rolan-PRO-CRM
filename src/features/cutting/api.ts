import type {
  CuttingPlanOptions,
  MeasurementPanelInput,
  RollStockInput,
  RollWidthIn,
} from "@/features/cutting/types";

const MAX_PANELS_PER_PREVIEW = 250;
const MAX_TOTAL_PIECES_PER_PREVIEW = 1000;
const MAX_DIMENSION_IN = 2400;
const MAX_ROLL_LENGTH_IN = 1_000_000;

type CuttingPreviewParseResult =
  | {
      ok: true;
      panels: MeasurementPanelInput[];
      options: CuttingPlanOptions;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function firstValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }

  return undefined;
}

function readString(record: Record<string, unknown>, keys: string[]) {
  const value = firstValue(record, keys);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function readBoolean(record: Record<string, unknown>, keys: string[]) {
  const value = firstValue(record, keys);

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "y"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "n"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function readNumber(record: Record<string, unknown>, keys: string[]) {
  const value = firstValue(record, keys);

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");

    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readPositiveNumber(record: Record<string, unknown>, keys: string[], label: string) {
  const value = readNumber(record, keys);

  if (value === null || value <= 0 || value > MAX_DIMENSION_IN) {
    return {
      ok: false as const,
      message: `${label} must be a positive number under ${MAX_DIMENSION_IN} inches.`,
    };
  }

  return {
    ok: true as const,
    value,
  };
}

function readOptionalPositiveInteger(record: Record<string, unknown>, keys: string[]) {
  const value = firstValue(record, keys);

  if (value === undefined || value === null || value === "") {
    return {
      ok: true as const,
      value: undefined,
    };
  }

  const parsed = readNumber(record, keys);

  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
    return {
      ok: false as const,
      message: "quantity must be a positive integer.",
    };
  }

  return {
    ok: true as const,
    value: parsed,
  };
}

function parsePanel(value: unknown, index: number): CuttingPreviewParseResult {
  const record = asRecord(value);

  if (!record) {
    return {
      ok: false,
      code: "invalid_panel",
      message: `panels[${index}] must be an object.`,
    };
  }

  const width = readPositiveNumber(
    record,
    ["glassWidthIn", "glass_width_in", "glassWidth", "glass_width", "widthIn", "width"],
    `panels[${index}].glassWidthIn`,
  );

  if (!width.ok) {
    return {
      ok: false,
      code: "invalid_panel_width",
      message: width.message,
    };
  }

  const height = readPositiveNumber(
    record,
    ["glassHeightIn", "glass_height_in", "glassHeight", "glass_height", "heightIn", "height"],
    `panels[${index}].glassHeightIn`,
  );

  if (!height.ok) {
    return {
      ok: false,
      code: "invalid_panel_height",
      message: height.message,
    };
  }

  const quantity = readOptionalPositiveInteger(record, ["quantity", "qty", "count"]);

  if (!quantity.ok) {
    return {
      ok: false,
      code: "invalid_panel_quantity",
      message: `panels[${index}].${quantity.message}`,
    };
  }

  return {
    ok: true,
    panels: [
      {
        id: readString(record, ["id", "panelId", "panel_id"]) ?? undefined,
        roomName: readString(record, ["roomName", "room_name", "room"]) ?? undefined,
        windowName: readString(record, ["windowName", "window_name", "window"]) ?? undefined,
        label: readString(record, ["label", "name"]) ?? undefined,
        glassWidthIn: width.value,
        glassHeightIn: height.value,
        quantity: quantity.value,
        allowRotation: readBoolean(record, ["allowRotation", "allow_rotation"]) ?? false,
      },
    ],
    options: {},
  };
}

function parseRollWidths(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const widths = value
    .map((entry) => (typeof entry === "string" ? Number(entry.trim()) : entry))
    .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry) && entry > 0);

  return widths.length ? (Array.from(new Set(widths)) as RollWidthIn[]) : null;
}

function parseRollStock(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const stock: RollStockInput[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const record = asRecord(value[index]);

    if (!record) {
      return null;
    }

    const rollWidthIn = readNumber(record, ["rollWidthIn", "roll_width_in", "widthIn", "width"]);
    const availableLengthIn = readNumber(record, [
      "availableLengthIn",
      "available_length_in",
      "availableLength",
      "available_length",
      "lengthIn",
      "length",
    ]);

    if (
      rollWidthIn === null ||
      rollWidthIn <= 0 ||
      availableLengthIn === null ||
      availableLengthIn < 0 ||
      availableLengthIn > MAX_ROLL_LENGTH_IN
    ) {
      return null;
    }

    stock.push({
      rollId: readString(record, ["rollId", "roll_id", "id"]) ?? undefined,
      rollWidthIn,
      availableLengthIn,
    });
  }

  return stock;
}

function parseOptions(value: unknown): CuttingPreviewParseResult {
  if (value === undefined || value === null) {
    return {
      ok: true,
      panels: [],
      options: {},
    };
  }

  const record = asRecord(value);

  if (!record) {
    return {
      ok: false,
      code: "invalid_options",
      message: "options must be an object.",
    };
  }

  const overlapIn = readNumber(record, ["overlapIn", "overlap_in", "overlap"]);

  if (overlapIn !== null && (overlapIn < 0 || overlapIn > 24)) {
    return {
      ok: false,
      code: "invalid_overlap",
      message: "overlapIn must be between 0 and 24 inches.",
    };
  }

  const rollWidthsIn = parseRollWidths(firstValue(record, ["rollWidthsIn", "roll_widths_in", "rollWidths"]));

  if (rollWidthsIn === null) {
    return {
      ok: false,
      code: "invalid_roll_widths",
      message: "rollWidthsIn must be an array of positive numbers.",
    };
  }

  const rollStock = parseRollStock(firstValue(record, ["rollStock", "roll_stock", "stock"]));

  if (rollStock === null) {
    return {
      ok: false,
      code: "invalid_roll_stock",
      message: "rollStock must contain rollWidthIn and availableLengthIn.",
    };
  }

  return {
    ok: true,
    panels: [],
    options: {
      ...(overlapIn !== null ? { overlapIn } : {}),
      ...(rollWidthsIn ? { rollWidthsIn } : {}),
      ...(rollStock ? { rollStock } : {}),
    },
  };
}

export function parseCuttingPreviewPayload(body: unknown): CuttingPreviewParseResult {
  const record = asRecord(body);

  if (!record) {
    return {
      ok: false,
      code: "invalid_payload",
      message: "Request body must be an object.",
    };
  }

  const panelsValue = firstValue(record, ["panels", "pieces", "measurements"]);

  if (!Array.isArray(panelsValue) || panelsValue.length === 0) {
    return {
      ok: false,
      code: "invalid_payload",
      message: "panels array is required.",
    };
  }

  if (panelsValue.length > MAX_PANELS_PER_PREVIEW) {
    return {
      ok: false,
      code: "too_many_panels",
      message: `A preview can include up to ${MAX_PANELS_PER_PREVIEW} panels.`,
    };
  }

  const panels: MeasurementPanelInput[] = [];
  let totalPieces = 0;

  for (let index = 0; index < panelsValue.length; index += 1) {
    const parsed = parsePanel(panelsValue[index], index);

    if (!parsed.ok) {
      return parsed;
    }

    const panel = parsed.panels[0];
    panels.push(panel);
    totalPieces += panel.quantity ?? 1;
  }

  if (totalPieces > MAX_TOTAL_PIECES_PER_PREVIEW) {
    return {
      ok: false,
      code: "too_many_pieces",
      message: `A preview can include up to ${MAX_TOTAL_PIECES_PER_PREVIEW} cut pieces.`,
    };
  }

  const parsedOptions = parseOptions(firstValue(record, ["options", "settings"]));

  if (!parsedOptions.ok) {
    return parsedOptions;
  }

  return {
    ok: true,
    panels,
    options: parsedOptions.options,
  };
}
