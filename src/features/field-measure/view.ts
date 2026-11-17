/**
 * Read model for the field measurement screen (/field/measure).
 *
 * It reads the same legacy workspace the CRM already returns to this employee
 * and never writes. Areas follow `windowActualAreaSqft()` of the legacy CRM, so
 * the square feet shown here are the ones the Project is priced from.
 */

type Json = Record<string, unknown>;

const MM_PER_INCH = 25.4;
const SQFT_PER_M2 = 10.7639104;

export const FIELD_MEASURE_STATUSES = ["measurement_scheduled", "consultation_scheduled", "new", "measurement_done"] as const;

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  consultation_scheduled: "Консультация назначена",
  measurement_scheduled: "Замер назначен",
  measurement_done: "Замер выполнен",
};

const SCOPE_LABELS: Record<string, string> = {
  solar_film: "Солнцезащитная",
  smart_film: "Смарт",
  protective_film: "Защитная",
  decorative_film: "Декоративная",
  privacy_film: "Приватная",
};

const WINDOW_TYPE_LABELS: Record<string, string> = {
  single_hung: "Single hung",
  double_hung: "Double hung",
  casement_single: "Окно, 1 створка",
  casement_double: "Окно, 2 створки",
  casement_triple: "Окно, 3 створки",
  picture: "Глухое",
  panoramic: "Панорамное",
  sliding_window: "Раздвижное окно",
  french_window: "Французское окно",
  single_door: "Стеклянная дверь",
  double_door: "Двойная дверь",
  sliding_door: "Sliding patio door",
  french_door_single: "French door",
  french_door_double: "French door, двойная",
  panoramic_door: "Панорамная дверь",
  transom: "С фрамугой",
  glass_partition: "Перегородка",
};

export type FieldMeasureWindow = {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  qty: number;
  sqft: number;
  service: string;
  film: string;
  filmOnSite: boolean;
  removal: boolean;
  sizeEntered: boolean;
  verified: boolean;
  panels: number;
  notes: string;
};

export type FieldMeasureRoom = { id: string; name: string; sqft: number; windows: FieldMeasureWindow[] };

export type FieldMeasureProject = {
  id: string;
  number: string;
  status: string;
  statusLabel: string;
  clientName: string;
  phone: string;
  address: string;
  measurementAt: string;
  mine: boolean;
  windowCount: number;
  sizesMissing: number;
  totalSqft: number;
};

export type FieldMeasureDetail = FieldMeasureProject & {
  units: "inches" | "mm";
  rooms: FieldMeasureRoom[];
  services: { name: string; sqft: number; windows: number }[];
  notes: string;
};

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}
function positive(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function round(value: number, digits: number) {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}
function mm2ToSqft(mm2: number) {
  return (mm2 / 1_000_000) * SQFT_PER_M2;
}

/** Same rule as legacy `windowActualAreaSqft()`: saved panels win until the surveyor confirms actual panels. */
export function windowAreaSqft(win: Json): number {
  const panels = list(win.panels).filter((panel) => positive(panel.width) && positive(panel.height));
  if (Array.isArray(win.panels) && win.panels.length && win.actualPanels == null) {
    const qty = positive(win.qty) || 1;
    if (panels.length) return panels.reduce((sum, panel) => sum + mm2ToSqft(positive(panel.width) * positive(panel.height)), 0) * qty;
    return mm2ToSqft(positive(win.width) * positive(win.height)) * qty;
  }
  const width = positive(win.actualWidth) || positive(win.width);
  const height = positive(win.actualHeight) || positive(win.height);
  const qty = positive(win.actualQty) || positive(win.qty) || 1;
  return mm2ToSqft(width * height) * qty;
}

function toInput(mm: number, units: "inches" | "mm") {
  return units === "inches" ? round(mm / MM_PER_INCH, 2) : Math.round(mm);
}

function windowSizeEntered(win: Json) {
  const placeholder = isObject(win.sizePlaceholder) ? win.sizePlaceholder : null;
  return !(placeholder && (placeholder.width || placeholder.height));
}

function windowService(order: Json, win: Json) {
  const offering = text(win.offeringName);
  if (offering) return offering;
  const scope = text(win.measureScope) || text(order.serviceType) || "solar_film";
  return SCOPE_LABELS[scope] || scope;
}

function orderAddress(order: Json, client: Json | null) {
  if (client && order.addressId) {
    const found = list(client.addresses).find((address) => address.id === order.addressId);
    if (found && text(found.address)) return text(found.address);
  }
  return text(order.address) || text(client?.address);
}

function allWindows(order: Json) {
  const measurements = isObject(order.measurements) ? order.measurements : {};
  return list(measurements.rooms).flatMap((room) => list(room.windows));
}

function projectCard(order: Json, clients: Map<string, Json>, myIds: ReadonlySet<string>, everyOrderIsMine: boolean): FieldMeasureProject {
  const client = clients.get(text(order.clientId)) || null;
  const windows = allWindows(order);
  const status = text(order.status);
  return {
    id: text(order.id),
    number: text(order.number),
    status,
    statusLabel: STATUS_LABELS[status] || status,
    clientName: text(client?.name) || "Клиент",
    phone: text(client?.phone),
    address: orderAddress(order, client),
    measurementAt: text(order.measurementAt),
    mine: everyOrderIsMine || myIds.has(text(order.measurerId)),
    windowCount: windows.reduce((sum, win) => sum + (positive(win.qty) || 1), 0),
    sizesMissing: windows.filter((win) => !windowSizeEntered(win) || windowAreaSqft(win) <= 0).length,
    totalSqft: round(windows.reduce((sum, win) => sum + windowAreaSqft(win), 0), 1),
  };
}

function clientIndex(payload: Json) {
  return new Map(list(payload.clients).map((client) => [text(client.id), client] as const));
}

export type FieldMeasureViewer = { legacyUserIds: readonly string[]; everyOrderIsMine: boolean };

/** Projects waiting for a survey, the nearest visit first; surveyed ones go last. */
export function fieldMeasureProjects(payload: Json, viewer: FieldMeasureViewer): FieldMeasureProject[] {
  const clients = clientIndex(payload);
  const myIds = new Set(viewer.legacyUserIds.map(String));
  const allowed = new Set<string>(FIELD_MEASURE_STATUSES);
  const rank = (project: FieldMeasureProject) => (project.status === "measurement_done" ? 2 : project.measurementAt ? 0 : 1);
  return list(payload.orders)
    .filter((order) => allowed.has(text(order.status)) && !order.archivedAt && !order.deletedAt)
    .map((order) => projectCard(order, clients, myIds, viewer.everyOrderIsMine))
    .sort((a, b) => rank(a) - rank(b) || a.measurementAt.localeCompare(b.measurementAt) || b.number.localeCompare(a.number));
}

export function fieldMeasureDetail(payload: Json, orderId: string, viewer: FieldMeasureViewer): FieldMeasureDetail | null {
  const order = list(payload.orders).find((item) => text(item.id) === orderId);
  if (!order) return null;
  const settings = isObject(payload.settings) ? payload.settings : {};
  const units: "inches" | "mm" = settings.inputUnits === "mm" ? "mm" : "inches";
  const measurements = isObject(order.measurements) ? order.measurements : {};
  const services = new Map<string, { name: string; sqft: number; windows: number }>();

  const rooms = list(measurements.rooms).map((room, roomIndex) => {
    const windows = list(room.windows).map((win, index): FieldMeasureWindow => {
      const sqft = windowAreaSqft(win);
      const service = windowService(order, win);
      const qty = positive(win.actualQty) || positive(win.qty) || 1;
      const bucket = services.get(service) || { name: service, sqft: 0, windows: 0 };
      bucket.sqft += sqft;
      bucket.windows += qty;
      services.set(service, bucket);
      const type = text(win.winType);
      return {
        id: text(win.id) || `${roomIndex}-${index}`,
        name: text(win.name) || `Окно ${index + 1}`,
        type: WINDOW_TYPE_LABELS[type] || type,
        width: toInput(positive(win.actualWidth) || positive(win.width), units),
        height: toInput(positive(win.actualHeight) || positive(win.height), units),
        qty,
        sqft: round(sqft, 2),
        service,
        film: text(win.filmType),
        filmOnSite: win.filmOnSite === true,
        removal: win.removalRequired === true || win.removal_required === true,
        sizeEntered: windowSizeEntered(win) && sqft > 0,
        verified: win.measurementSource === "SURVEYOR_VERIFIED" || win.measurement_source === "SURVEYOR_VERIFIED",
        panels: list(win.panels).length,
        notes: text(win.technicalNotes),
      };
    });
    return {
      id: text(room.id) || String(roomIndex),
      name: text(room.name) || `Помещение ${roomIndex + 1}`,
      sqft: round(windows.reduce((sum, win) => sum + win.sqft, 0), 1),
      windows,
    };
  });

  return {
    ...projectCard(order, clientIndex(payload), new Set(viewer.legacyUserIds.map(String)), viewer.everyOrderIsMine),
    units,
    rooms,
    services: [...services.values()].map((service) => ({ ...service, sqft: round(service.sqft, 1) })),
    notes: text(order.measurerNotes) || text(order.technicalNotes),
  };
}
