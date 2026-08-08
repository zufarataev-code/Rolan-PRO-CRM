import type {
  CutPiece,
  CutShelf,
  CuttingPlan,
  CuttingPlanOptions,
  CuttingPlanSummary,
  MeasurementPanelInput,
  RollStockInput,
  RollUsageSummary,
  RollWidthIn,
  UnfitCutPiece,
} from "@/features/cutting/types";

const DEFAULT_OVERLAP_IN = 3;
const DEFAULT_ROLL_WIDTHS_IN: RollWidthIn[] = [60, 72];
const SQIN_PER_SQFT = 144;
const IN_PER_FT = 12;

type UnitPiece = {
  pieceId: string;
  sourcePanelId: string;
  label: string;
  unitIndex: number;
  glassWidthIn: number;
  glassHeightIn: number;
  glassAreaSqft: number;
  baseCutWidthIn: number;
  baseCutLengthIn: number;
  cutAreaSqft: number;
  overlapIn: number;
  allowRotation: boolean;
};

type OrientedPiece = UnitPiece & {
  rollWidthIn: RollWidthIn;
  cutWidthIn: number;
  cutLengthIn: number;
  rotated: boolean;
};

type ShelfDraft = {
  rollWidthIn: RollWidthIn;
  shelfIndex: number;
  lengthIn: number;
  usedWidthIn: number;
  pieces: Array<OrientedPiece & { xIn: number }>;
};

type PlanCandidate = Omit<CuttingPlan, "summary"> & {
  summary: CuttingPlanSummary;
};

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function areaSqft(widthIn: number, heightIn: number) {
  return round((widthIn * heightIn) / SQIN_PER_SQFT, 4);
}

function normalizeRollWidths(value?: RollWidthIn[]) {
  const widths = (value?.length ? value : DEFAULT_ROLL_WIDTHS_IN)
    .map((width) => Number(width))
    .filter((width) => Number.isFinite(width) && width > 0);

  return Array.from(new Set(widths)).sort((a, b) => a - b);
}

function normalizeOverlap(value?: number) {
  if (value === undefined || value === null) {
    return DEFAULT_OVERLAP_IN;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Cut overlap must be a non-negative number.");
  }

  return value;
}

function normalizeQuantity(value: number | null | undefined) {
  if (value === undefined || value === null) {
    return 1;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Panel quantity must be a positive integer.");
  }

  return value;
}

function assertPositiveDimension(label: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function buildPanelLabel(panel: MeasurementPanelInput, index: number) {
  if (panel.label?.trim()) {
    return panel.label.trim();
  }

  const parts = [panel.roomName, panel.windowName].filter((value) => value?.trim());

  return parts.length ? parts.join(" / ") : `Panel ${index + 1}`;
}

function expandPanels(panels: MeasurementPanelInput[], overlapIn: number): UnitPiece[] {
  return panels.flatMap((panel, panelIndex) => {
    assertPositiveDimension("Panel glass width", panel.glassWidthIn);
    assertPositiveDimension("Panel glass height", panel.glassHeightIn);

    const quantity = normalizeQuantity(panel.quantity);
    const sourcePanelId = panel.id?.trim() || `panel-${panelIndex + 1}`;
    const label = buildPanelLabel(panel, panelIndex);
    const baseCutWidthIn = panel.glassWidthIn + overlapIn * 2;
    const baseCutLengthIn = panel.glassHeightIn + overlapIn * 2;
    const glassAreaSqft = areaSqft(panel.glassWidthIn, panel.glassHeightIn);
    const cutAreaSqft = areaSqft(baseCutWidthIn, baseCutLengthIn);

    return Array.from({ length: quantity }, (_, quantityIndex) => ({
      pieceId: `${sourcePanelId}-${quantityIndex + 1}`,
      sourcePanelId,
      label,
      unitIndex: quantityIndex + 1,
      glassWidthIn: panel.glassWidthIn,
      glassHeightIn: panel.glassHeightIn,
      glassAreaSqft,
      baseCutWidthIn,
      baseCutLengthIn,
      cutAreaSqft,
      overlapIn,
      allowRotation: Boolean(panel.allowRotation),
    }));
  });
}

function getOrientation(piece: UnitPiece, rollWidthIn: RollWidthIn): OrientedPiece | null {
  const width = Number(rollWidthIn);
  const options: Array<Pick<OrientedPiece, "cutWidthIn" | "cutLengthIn" | "rotated">> = [];

  if (piece.baseCutWidthIn <= width) {
    options.push({
      cutWidthIn: piece.baseCutWidthIn,
      cutLengthIn: piece.baseCutLengthIn,
      rotated: false,
    });
  }

  if (piece.allowRotation && piece.baseCutLengthIn <= width) {
    options.push({
      cutWidthIn: piece.baseCutLengthIn,
      cutLengthIn: piece.baseCutWidthIn,
      rotated: true,
    });
  }

  if (!options.length) {
    return null;
  }

  const best = options.sort((a, b) => {
    if (a.cutLengthIn !== b.cutLengthIn) {
      return a.cutLengthIn - b.cutLengthIn;
    }

    return a.cutWidthIn - b.cutWidthIn;
  })[0];

  return {
    ...piece,
    rollWidthIn,
    cutWidthIn: best.cutWidthIn,
    cutLengthIn: best.cutLengthIn,
    rotated: best.rotated,
  };
}

function buildUnfitPiece(piece: UnitPiece, rollWidthsIn: RollWidthIn[]): UnfitCutPiece {
  return {
    pieceId: piece.pieceId,
    sourcePanelId: piece.sourcePanelId,
    label: piece.label,
    requiredWidthIn: round(piece.baseCutWidthIn, 2),
    requiredLengthIn: round(piece.baseCutLengthIn, 2),
    maxRollWidthIn: Math.max(...rollWidthsIn.map(Number)),
    allowRotation: piece.allowRotation,
    reason: "Cut width does not fit available roll widths.",
  };
}

function findSmallestFittingRoll(piece: UnitPiece, rollWidthsIn: RollWidthIn[]) {
  for (const rollWidthIn of rollWidthsIn) {
    const oriented = getOrientation(piece, rollWidthIn);

    if (oriented) {
      return oriented;
    }
  }

  return null;
}

function packOrientedPieces(rollWidthIn: RollWidthIn, pieces: OrientedPiece[]) {
  const sortedPieces = [...pieces].sort((a, b) => {
    if (b.cutLengthIn !== a.cutLengthIn) {
      return b.cutLengthIn - a.cutLengthIn;
    }

    return b.cutWidthIn - a.cutWidthIn;
  });
  const shelves: ShelfDraft[] = [];
  const rollWidth = Number(rollWidthIn);

  for (const piece of sortedPieces) {
    let bestShelf: ShelfDraft | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const shelf of shelves) {
      if (shelf.usedWidthIn + piece.cutWidthIn > rollWidth) {
        continue;
      }

      const addedLengthIn = Math.max(0, piece.cutLengthIn - shelf.lengthIn);
      const remainingWidthAfter = rollWidth - shelf.usedWidthIn - piece.cutWidthIn;
      const score = addedLengthIn * rollWidth + remainingWidthAfter / 1000;

      if (score < bestScore) {
        bestScore = score;
        bestShelf = shelf;
      }
    }

    if (!bestShelf) {
      bestShelf = {
        rollWidthIn,
        shelfIndex: shelves.length,
        lengthIn: piece.cutLengthIn,
        usedWidthIn: 0,
        pieces: [],
      };
      shelves.push(bestShelf);
    }

    bestShelf.pieces.push({
      ...piece,
      xIn: bestShelf.usedWidthIn,
    });
    bestShelf.usedWidthIn += piece.cutWidthIn;
    bestShelf.lengthIn = Math.max(bestShelf.lengthIn, piece.cutLengthIn);
  }

  const cutPieces: CutPiece[] = [];
  const cutShelves: CutShelf[] = [];
  let yIn = 0;

  shelves.forEach((shelf) => {
    const shelfPieces = shelf.pieces.map((piece) => ({
      pieceId: piece.pieceId,
      sourcePanelId: piece.sourcePanelId,
      label: piece.label,
      unitIndex: piece.unitIndex,
      glassWidthIn: round(piece.glassWidthIn, 2),
      glassHeightIn: round(piece.glassHeightIn, 2),
      glassAreaSqft: piece.glassAreaSqft,
      cutWidthIn: round(piece.cutWidthIn, 2),
      cutLengthIn: round(piece.cutLengthIn, 2),
      cutAreaSqft: piece.cutAreaSqft,
      overlapIn: piece.overlapIn,
      rollWidthIn: piece.rollWidthIn,
      shelfIndex: shelf.shelfIndex,
      xIn: round(piece.xIn, 2),
      yIn: round(yIn, 2),
      rotated: piece.rotated,
    }));

    cutPieces.push(...shelfPieces);
    cutShelves.push({
      rollWidthIn,
      shelfIndex: shelf.shelfIndex,
      yIn: round(yIn, 2),
      lengthIn: round(shelf.lengthIn, 2),
      usedWidthIn: round(shelf.usedWidthIn, 2),
      wasteWidthIn: round(rollWidth - shelf.usedWidthIn, 2),
      pieceIds: shelfPieces.map((piece) => piece.pieceId),
    });

    yIn += shelf.lengthIn;
  });

  return {
    pieces: cutPieces,
    shelves: cutShelves,
  };
}

function getAvailableLengthByWidth(rollStock: RollStockInput[] | undefined, rollWidthIn: RollWidthIn) {
  if (!rollStock?.length) {
    return null;
  }

  return rollStock
    .filter((roll) => Number(roll.rollWidthIn) === Number(rollWidthIn))
    .reduce((sum, roll) => sum + roll.availableLengthIn, 0);
}

function summarizePlan(
  input: {
    panels: MeasurementPanelInput[];
    pieces: CutPiece[];
    shelves: CutShelf[];
    unfitPieces: UnfitCutPiece[];
  },
  options: Required<Pick<CuttingPlanOptions, "rollWidthsIn">> & Pick<CuttingPlanOptions, "rollStock">,
) {
  const rollUsages: RollUsageSummary[] = options.rollWidthsIn.map((rollWidthIn) => {
    const rollPieces = input.pieces.filter((piece) => Number(piece.rollWidthIn) === Number(rollWidthIn));
    const rollShelves = input.shelves.filter((shelf) => Number(shelf.rollWidthIn) === Number(rollWidthIn));
    const requiredLinearIn = rollShelves.reduce((sum, shelf) => sum + shelf.lengthIn, 0);
    const rollAreaSqft = rollShelves.reduce(
      (sum, shelf) => sum + (Number(shelf.rollWidthIn) * shelf.lengthIn) / SQIN_PER_SQFT,
      0,
    );
    const cutAreaSqft = rollPieces.reduce((sum, piece) => sum + piece.cutAreaSqft, 0);
    const wasteSqft = Math.max(0, rollAreaSqft - cutAreaSqft);
    const availableLinearIn = getAvailableLengthByWidth(options.rollStock, rollWidthIn);
    const remainingLinearIn = availableLinearIn === null ? null : availableLinearIn - requiredLinearIn;

    return {
      rollWidthIn,
      pieces: rollPieces.length,
      shelves: rollShelves.length,
      requiredLinearIn: round(requiredLinearIn, 2),
      requiredLinearFt: round(requiredLinearIn / IN_PER_FT, 2),
      availableLinearIn: availableLinearIn === null ? null : round(availableLinearIn, 2),
      remainingLinearIn: remainingLinearIn === null ? null : round(remainingLinearIn, 2),
      shortageLinearIn: remainingLinearIn !== null && remainingLinearIn < 0 ? round(Math.abs(remainingLinearIn), 2) : 0,
      rollAreaSqft: round(rollAreaSqft, 4),
      cutAreaSqft: round(cutAreaSqft, 4),
      wasteSqft: round(wasteSqft, 4),
      wastePercent: rollAreaSqft > 0 ? round((wasteSqft / rollAreaSqft) * 100, 2) : 0,
    };
  });
  const glassSqft = input.pieces.reduce((sum, piece) => sum + piece.glassAreaSqft, 0);
  const actualFilmSqft = input.pieces.reduce((sum, piece) => sum + piece.cutAreaSqft, 0);
  const materialConsumptionSqft = rollUsages.reduce((sum, usage) => sum + usage.rollAreaSqft, 0);
  const wasteSqft = Math.max(0, materialConsumptionSqft - actualFilmSqft);

  return {
    panelCount: input.panels.length,
    pieceCount: input.pieces.length,
    unfitCount: input.unfitPieces.length,
    glassSqft: round(glassSqft, 4),
    actualFilmSqft: round(actualFilmSqft, 4),
    materialConsumptionSqft: round(materialConsumptionSqft, 4),
    wasteSqft: round(wasteSqft, 4),
    wastePercent: materialConsumptionSqft > 0 ? round((wasteSqft / materialConsumptionSqft) * 100, 2) : 0,
    requiredLinearFeet: round(
      rollUsages.reduce((sum, usage) => sum + usage.requiredLinearIn, 0) / IN_PER_FT,
      2,
    ),
    rollUsages,
  };
}

function buildPlanCandidate(
  strategy: string,
  panels: MeasurementPanelInput[],
  rollWidthsIn: RollWidthIn[],
  rollStock: RollStockInput[] | undefined,
  overlapIn: number,
  orientedPieces: OrientedPiece[],
  unfitPieces: UnfitCutPiece[],
): PlanCandidate {
  const packedByWidth = rollWidthsIn.map((rollWidthIn) => {
    const group = orientedPieces.filter((piece) => Number(piece.rollWidthIn) === Number(rollWidthIn));
    return packOrientedPieces(rollWidthIn, group);
  });
  const pieces = packedByWidth.flatMap((packed) => packed.pieces);
  const shelves = packedByWidth.flatMap((packed) => packed.shelves);
  const summary = summarizePlan(
    {
      panels,
      pieces,
      shelves,
      unfitPieces,
    },
    {
      rollWidthsIn,
      rollStock,
    },
  );

  return {
    overlapIn,
    strategy,
    rollWidthsIn,
    pieces,
    shelves,
    unfitPieces,
    summary,
  };
}

function comparePlans(a: PlanCandidate, b: PlanCandidate) {
  if (a.summary.unfitCount !== b.summary.unfitCount) {
    return a.summary.unfitCount - b.summary.unfitCount;
  }

  if (a.summary.wasteSqft !== b.summary.wasteSqft) {
    return a.summary.wasteSqft - b.summary.wasteSqft;
  }

  if (a.summary.requiredLinearFeet !== b.summary.requiredLinearFeet) {
    return a.summary.requiredLinearFeet - b.summary.requiredLinearFeet;
  }

  return Math.max(...a.rollWidthsIn.map(Number)) - Math.max(...b.rollWidthsIn.map(Number));
}

export function calculateCuttingPlan(
  panels: MeasurementPanelInput[],
  options: CuttingPlanOptions = {},
): CuttingPlan {
  if (!panels.length) {
    throw new Error("At least one measurement panel is required.");
  }

  const overlapIn = normalizeOverlap(options.overlapIn);
  const rollWidthsIn = normalizeRollWidths(options.rollWidthsIn);
  const unitPieces = expandPanels(panels, overlapIn);
  const candidates: PlanCandidate[] = [];

  for (const rollWidthIn of rollWidthsIn) {
    const orientedPieces: OrientedPiece[] = [];
    const unfitPieces: UnfitCutPiece[] = [];

    for (const piece of unitPieces) {
      const oriented = getOrientation(piece, rollWidthIn);

      if (oriented) {
        orientedPieces.push(oriented);
      } else {
        unfitPieces.push(buildUnfitPiece(piece, [rollWidthIn]));
      }
    }

    candidates.push(
      buildPlanCandidate(
        `single-roll-${rollWidthIn}`,
        panels,
        rollWidthsIn,
        options.rollStock,
        overlapIn,
        orientedPieces,
        unfitPieces,
      ),
    );
  }

  const mixedPieces: OrientedPiece[] = [];
  const mixedUnfitPieces: UnfitCutPiece[] = [];

  for (const piece of unitPieces) {
    const oriented = findSmallestFittingRoll(piece, rollWidthsIn);

    if (oriented) {
      mixedPieces.push(oriented);
    } else {
      mixedUnfitPieces.push(buildUnfitPiece(piece, rollWidthsIn));
    }
  }

  candidates.push(
    buildPlanCandidate(
      "mixed-smallest-fitting-roll",
      panels,
      rollWidthsIn,
      options.rollStock,
      overlapIn,
      mixedPieces,
      mixedUnfitPieces,
    ),
  );

  return candidates.sort(comparePlans)[0];
}

export function calculateCutSize(
  glassWidthIn: number,
  glassHeightIn: number,
  overlapIn = DEFAULT_OVERLAP_IN,
) {
  assertPositiveDimension("Glass width", glassWidthIn);
  assertPositiveDimension("Glass height", glassHeightIn);
  const normalizedOverlap = normalizeOverlap(overlapIn);

  return {
    cutWidthIn: round(glassWidthIn + normalizedOverlap * 2, 2),
    cutLengthIn: round(glassHeightIn + normalizedOverlap * 2, 2),
    glassAreaSqft: areaSqft(glassWidthIn, glassHeightIn),
    cutAreaSqft: areaSqft(glassWidthIn + normalizedOverlap * 2, glassHeightIn + normalizedOverlap * 2),
  };
}
