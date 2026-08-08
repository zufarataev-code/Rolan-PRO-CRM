export type RollWidthIn = 60 | 72 | number;

export type MeasurementPanelInput = {
  id?: string;
  roomName?: string | null;
  windowName?: string | null;
  label?: string | null;
  glassWidthIn: number;
  glassHeightIn: number;
  quantity?: number | null;
  allowRotation?: boolean;
};

export type RollStockInput = {
  rollId?: string;
  rollWidthIn: RollWidthIn;
  availableLengthIn: number;
};

export type CuttingPlanOptions = {
  overlapIn?: number;
  rollWidthsIn?: RollWidthIn[];
  rollStock?: RollStockInput[];
};

export type CutPiece = {
  pieceId: string;
  sourcePanelId: string;
  label: string;
  unitIndex: number;
  glassWidthIn: number;
  glassHeightIn: number;
  glassAreaSqft: number;
  cutWidthIn: number;
  cutLengthIn: number;
  cutAreaSqft: number;
  overlapIn: number;
  rollWidthIn: RollWidthIn;
  shelfIndex: number;
  xIn: number;
  yIn: number;
  rotated: boolean;
};

export type UnfitCutPiece = {
  pieceId: string;
  sourcePanelId: string;
  label: string;
  requiredWidthIn: number;
  requiredLengthIn: number;
  maxRollWidthIn: number;
  allowRotation: boolean;
  reason: string;
};

export type CutShelf = {
  rollWidthIn: RollWidthIn;
  shelfIndex: number;
  yIn: number;
  lengthIn: number;
  usedWidthIn: number;
  wasteWidthIn: number;
  pieceIds: string[];
};

export type RollUsageSummary = {
  rollWidthIn: RollWidthIn;
  pieces: number;
  shelves: number;
  requiredLinearIn: number;
  requiredLinearFt: number;
  availableLinearIn: number | null;
  remainingLinearIn: number | null;
  shortageLinearIn: number;
  rollAreaSqft: number;
  cutAreaSqft: number;
  wasteSqft: number;
  wastePercent: number;
};

export type CuttingPlanSummary = {
  panelCount: number;
  pieceCount: number;
  unfitCount: number;
  glassSqft: number;
  actualFilmSqft: number;
  materialConsumptionSqft: number;
  wasteSqft: number;
  wastePercent: number;
  requiredLinearFeet: number;
  rollUsages: RollUsageSummary[];
};

export type CuttingPlan = {
  overlapIn: number;
  strategy: string;
  rollWidthsIn: RollWidthIn[];
  pieces: CutPiece[];
  shelves: CutShelf[];
  unfitPieces: UnfitCutPiece[];
  summary: CuttingPlanSummary;
};
