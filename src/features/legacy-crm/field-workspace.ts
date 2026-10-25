import { ROLE_CODES } from "@/lib/auth/constants";
import { projectServicesFinished, projectServicesStarted, serviceGroupIds, serviceGroupName, serviceGroupScope } from "@/features/legacy-crm/service-solutions";
import { mergeFieldProductionStages } from "@/features/legacy-crm/production-stages";

type JsonObject = Record<string, unknown>;

const FIELD_ROLE_NAMES = new Set(["measurer", "installer"]);
const FINANCIAL_KEY = /(?:price|retail|wholesale|cost|margin|profit|revenue|lifetimevalue|paid|payment|deposit|debt|invoice|commission|discount|tax|subtotal|saleamount|refund|overhead|targetprofit|payout|payroll|laborShare|ratepersqft|amount)/i;
const FINANCIAL_TIMELINE_KEYS = new Set([
  "deposit_received",
  "payment_received",
  "stripe_paid",
  "payout_paid",
  "stripe_link_created",
  "invoice_sent",
  "premium_proposal_accepted",
]);

const CLOSED_STATUSES = new Set(["installation_done", "act_signed", "payment_received", "completed", "review_received"]);
const SERVICE_TIMELINE_KEYS = new Set(["service_started", "service_done", "service_reopened"]);

const MUTABLE_ORDER_FIELDS = new Set([
  "status",
  "measurements",
  "timeline",
  "photos",
  "photoUrls",
  "attachments",
  "files",
  "notes",
  "technicalNotes",
  "measurerNotes",
  "installerNotes",
  "measurementAcceptedAt",
  "measurementDoneAt",
  "technicalSheet",
  "technicalSheetUpdatedAt",
  "installationAcceptedAt",
  "installationStartedAt",
  "installationDoneAt",
  "installationPhotos",
  "installationChecklist",
  "checklist",
  "issues",
  "signature",
  "serviceProgress",
  "productionStages",
  "updatedAt",
]);

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function serviceIdForWindow(order: JsonObject, window: JsonObject) {
  const offeringId = typeof window.offeringId === "string" ? window.offeringId : "";
  if (offeringId) return `offering:${offeringId}`;
  return `direction:${String(window.measureScope || order.serviceType || "solar_film")}`;
}

/**
 * A field browser may hold a stale copy of a completed service while editing
 * another service that is still open. Keep only the completed service windows
 * authoritative; do not replace the whole measurements tree, or legitimate
 * edits to unfinished services would be lost.
 */
function restoreCompletedServiceMeasurements(currentOrder: JsonObject, nextOrder: JsonObject) {
  const progress = isObject(currentOrder.serviceProgress) ? currentOrder.serviceProgress : {};
  const doneServiceIds = new Set(
    serviceGroupIds(currentOrder).filter((id) => isObject(progress[id]) && progress[id].status === "done"),
  );
  if (!doneServiceIds.size) return;

  const currentMeasurements = isObject(currentOrder.measurements) ? currentOrder.measurements : {};
  const nextMeasurements = isObject(nextOrder.measurements) ? clone(nextOrder.measurements) : {};
  const currentRooms = (Array.isArray(currentMeasurements.rooms) ? currentMeasurements.rooms : []).filter(isObject);
  const nextRooms = (Array.isArray(nextMeasurements.rooms) ? nextMeasurements.rooms : []).filter(isObject);
  const nextById = new Map(nextRooms.map((room) => [String(room.id || ""), room]));
  const savedWindows = new Map(
    currentRooms.flatMap((room) => (Array.isArray(room.windows) ? room.windows : []))
      .filter(isObject)
      .map((window) => [String(window.id || ""), window] as const),
  );

  // Classify an existing window by its saved identity, not by fields from a
  // stale/edited browser snapshot. A completed window is restored wholesale.
  // An unfinished window may keep new measurements, but it cannot be silently
  // reassigned into a service that is already completed.
  for (const room of nextRooms) {
    if (!Array.isArray(room.windows)) continue;
    room.windows = room.windows.filter((window) => {
      if (!isObject(window)) return true;
      const saved = savedWindows.get(String(window.id || ""));
      if (saved) {
        const savedServiceId = serviceIdForWindow(currentOrder, saved);
        if (doneServiceIds.has(savedServiceId)) return false;
        const submittedServiceId = serviceIdForWindow(currentOrder, window);
        if (doneServiceIds.has(submittedServiceId)) {
          if ("offeringId" in saved) window.offeringId = clone(saved.offeringId);
          else delete window.offeringId;
          if ("measureScope" in saved) window.measureScope = clone(saved.measureScope);
          else delete window.measureScope;
          if ("offeringName" in saved) window.offeringName = clone(saved.offeringName);
          else delete window.offeringName;
        }
        return true;
      }
      // A brand-new field window cannot be added directly to already-completed
      // work; the service must be reopened by a manager first.
      return !doneServiceIds.has(serviceIdForWindow(currentOrder, window));
    });
  }

  // Reinsert only the completed-service windows from the authoritative saved
  // project. Unfinished-service windows and room edits remain as submitted.
  for (const currentRoom of currentRooms) {
    const doneWindows = (Array.isArray(currentRoom.windows) ? currentRoom.windows : [])
      .filter(isObject)
      .filter((window) => doneServiceIds.has(serviceIdForWindow(currentOrder, window)))
      .map((window) => clone(window));
    if (!doneWindows.length) continue;

    const roomId = String(currentRoom.id || "");
    let target = nextById.get(roomId);
    if (!target) {
      target = { ...clone(currentRoom), windows: [] };
      nextRooms.push(target);
      nextById.set(roomId, target);
    }
    const kept = Array.isArray(target.windows) ? target.windows.filter(isObject) : [];
    target.windows = [...kept, ...doneWindows];
  }

  nextMeasurements.rooms = nextRooms;
  nextOrder.measurements = nextMeasurements;
}

function redactFinancialData(value: unknown, parentKey = ""): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => redactFinancialData(item, parentKey));
    if (parentKey === "timeline") {
      return items.filter(
        (item) => !isObject(item) || !FINANCIAL_TIMELINE_KEYS.has(String(item.key || "")),
      );
    }
    return items;
  }

  if (!isObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FINANCIAL_KEY.test(key))
      .map(([key, item]) => [key, redactFinancialData(item, key)]),
  );
}

function mergeOperationalValue(current: unknown, submitted: unknown): unknown {
  if (Array.isArray(submitted)) {
    if (!Array.isArray(current)) return redactFinancialData(clone(submitted));
    return submitted.map((item) => {
      if (!isObject(item) || !item.id) return redactFinancialData(clone(item));
      const currentItem = current.find(
        (candidate) => isObject(candidate) && String(candidate.id || "") === String(item.id),
      );
      return mergeOperationalValue(currentItem, item);
    });
  }
  if (!isObject(submitted)) return clone(submitted);
  const result = isObject(current) ? clone(current) : {};
  for (const [key, value] of Object.entries(submitted)) {
    if (FINANCIAL_KEY.test(key)) continue;
    result[key] = mergeOperationalValue(result[key], value);
  }
  return result;
}

function allowedFieldStatuses(roles: readonly string[]) {
  const statuses = new Set<string>();
  if (roles.includes(ROLE_CODES.CONSULTANT)) {
    for (const status of ["consultation_scheduled", "measurement_scheduled", "measurement_done"]) {
      statuses.add(status);
    }
  }
  if (roles.includes(ROLE_CODES.INSTALLER)) {
    for (const status of [
      "installation_scheduled",
      "installation_accepted",
      "installation_in_progress",
      "installation_done",
    ]) {
      statuses.add(status);
    }
  }
  return statuses;
}

function legacyRoleNames(roles: readonly string[]) {
  const result = new Set<string>();
  if (roles.includes(ROLE_CODES.CONSULTANT)) result.add("measurer");
  if (roles.includes(ROLE_CODES.INSTALLER)) result.add("installer");
  return result;
}

function fieldIdentityIds(payload: JsonObject, roles: readonly string[], legacyUserIds: readonly string[]) {
  if (legacyRoleNames(roles).size === 0) return new Set<string>();
  const users = Array.isArray(payload.users) ? payload.users : [];
  return new Set(
    users
      .filter(
        (user) =>
          isObject(user) &&
          legacyUserIds.includes(String(user.id || "")),
      )
      .map((user) => String((user as JsonObject).id)),
  );
}

function orderAssignedTo(order: JsonObject, identityIds: Set<string>, roles: readonly string[]) {
  if (
    roles.includes(ROLE_CODES.CONSULTANT) &&
    identityIds.has(String(order.measurerId || ""))
  ) {
    return true;
  }
  return roles.includes(ROLE_CODES.INSTALLER) && Array.isArray(order.installerIds)
    ? order.installerIds.some((id) => identityIds.has(String(id)))
    : false;
}

function effectiveLegacyRole(roles: readonly string[]) {
  if (roles.includes(ROLE_CODES.CONSULTANT)) return "measurer";
  if (roles.includes(ROLE_CODES.INSTALLER)) return "installer";
  return null;
}

function safeUser(user: JsonObject, own: boolean, roles: readonly string[]) {
  // An employee with several field roles has one card per role (surveyor card,
  // installer card); keep each own card's role instead of collapsing both.
  const heldRoles = legacyRoleNames(roles);
  const effectiveRole = own
    ? (heldRoles.has(String(user.role || "")) ? String(user.role) : effectiveLegacyRole(roles))
    : null;
  const result: JsonObject = {
    id: user.id,
    role: effectiveRole || user.role,
    name: user.name,
    title: user.title,
    phone: user.phone,
    email: user.email,
    lang: user.lang,
    active: user.active,
    photo: user.photo,
  };

  // Every field employee may see their own compensation configuration, never
  // another employee's settings. The browser needs this to explain each own
  // accrual; calculation still uses the shared payroll engine.
  if (own && effectiveRole && FIELD_ROLE_NAMES.has(effectiveRole)) {
    result.payConfig = clone(user.payConfig || {});
  }
  return result;
}

function safeSettings(settings: JsonObject, roles: readonly string[]) {
  const allowed = [
    "companyName",
    "currency",
    "filmTypes",
    "catalog",
    "inputUnits",
    "displayUnit",
    "complexityCoefs",
    "defaultMapCenter",
    "officeAddress",
    "logoDataUrl",
    // Installer work rates (service and additional-work rates the owner sets in
    // «Услуги и цены») — the installer's own pay basis, not client prices.
    // Without them the installer's earnings and analytics fell back to defaults.
    ...(roles.includes(ROLE_CODES.INSTALLER) ? ["installerRates"] : []),
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => key in settings)
      .map((key) => [key, redactFinancialData(clone(settings[key]), key)]),
  );
}

export function isPrivilegedLegacyWorkspaceRole(roles: readonly string[]) {
  return roles.includes(ROLE_CODES.OWNER) || roles.includes(ROLE_CODES.MANAGER);
}

export function createFieldWorkspace(
  payload: JsonObject,
  roles: readonly string[],
  legacyUserIds: readonly string[],
) {
  const identityIds = fieldIdentityIds(payload, roles, legacyUserIds);
  const allOrders = (Array.isArray(payload.orders) ? payload.orders : []).filter(isObject);
  const assignedOrders = allOrders.filter((order) => orderAssignedTo(order, identityIds, roles));
  const orderIds = new Set(assignedOrders.map((order) => String(order.id || "")));
  const clientIds = new Set(assignedOrders.map((order) => String(order.clientId || "")).filter(Boolean));
  const referencedUserIds = new Set(identityIds);
  for (const order of assignedOrders) {
    for (const id of [order.managerId, order.measurerId]) {
      if (id) referencedUserIds.add(String(id));
    }
    if (Array.isArray(order.installerIds)) {
      for (const id of order.installerIds) referencedUserIds.add(String(id));
    }
  }

  const linkedRecord = (record: JsonObject) => {
    const orderId = String(record.orderId || record.order_id || "");
    const clientId = String(record.clientId || record.client_id || "");
    const userId = String(record.userId || record.user_id || record.assigneeId || "");
    const teamIds = Array.isArray(record.teamIds) ? record.teamIds.map(String) : [];
    return (
      orderIds.has(orderId) ||
      clientIds.has(clientId) ||
      identityIds.has(userId) ||
      identityIds.has(String(record.responsibleId || "")) ||
      teamIds.some((id) => identityIds.has(id))
    );
  };

  const users = (Array.isArray(payload.users) ? payload.users : [])
    .filter(isObject)
    .filter((user) => referencedUserIds.has(String(user.id || "")))
    .map((user) => safeUser(user, identityIds.has(String(user.id || "")), roles));
  const clients = (Array.isArray(payload.clients) ? payload.clients : [])
    .filter(isObject)
    .filter((client) => clientIds.has(String(client.id || "")))
    .map((client) => redactFinancialData(clone(client)));
  const settings = isObject(payload.settings) ? safeSettings(payload.settings, roles) : {};
  const payrollPayments = (Array.isArray(payload.payrollPayments) ? payload.payrollPayments : [])
    .filter(isObject)
    .filter((payment) => identityIds.has(String(payment.userId || "")))
    .map((payment) => ({
      id: payment.id,
      userId: payment.userId,
      amount: Number(payment.amount || 0),
      paidAt: payment.paidAt,
      periodStart: payment.periodStart,
      periodEnd: payment.periodEnd,
      allocations: (Array.isArray(payment.allocations) ? payment.allocations : [])
        .filter(isObject)
        .filter((allocation) => !allocation.orderId || orderIds.has(String(allocation.orderId)))
        .map((allocation) => ({
          orderId: allocation.orderId || null,
          kind: allocation.kind,
          amount: Number(allocation.amount || 0),
          date: allocation.date,
          periodStart: allocation.periodStart,
          periodEnd: allocation.periodEnd,
        })),
    }));

  return {
    _allowedLegacyUserIds: [...identityIds],
    users,
    clients,
    orders: assignedOrders.map((order) => {
      const safe = redactFinancialData(clone(order)) as JsonObject;
      if (roles.includes(ROLE_CODES.INSTALLER) && Array.isArray(safe.productionStages)) {
        safe.productionStages = safe.productionStages.filter(isObject).map(stage => {
          const saved = (Array.isArray(order.productionStages) ? order.productionStages : []).filter(isObject).find(value => value.id === stage.id);
          const ownEarnings = (Array.isArray(saved?.payroll) ? saved.payroll : []).filter(isObject)
            .filter(row => identityIds.has(String(row.userId))).reduce((sum, row) => sum + Number(row.amount || 0), 0);
          return { ...stage, ownEarnings };
        });
      }
      return safe;
    }),
    notifications: (Array.isArray(payload.notifications) ? payload.notifications : [])
      .filter(isObject)
      .filter(linkedRecord)
      .map((record) => redactFinancialData(clone(record))),
    tasks: (Array.isArray(payload.tasks) ? payload.tasks : [])
      .filter(isObject)
      .filter(linkedRecord)
      .map((record) => redactFinancialData(clone(record))),
    reviews: [],
    payrollPayments,
    settings,
    geocache: clone(payload.geocache || {}),
    schemaVersion: payload.schemaVersion,
  };
}

/**
 * The crew of one service of a project (projectServiceAssignment): its saved
 * per-service plan, or — for a project planned as a whole — a quick line's own
 * crew or the project crew.
 */
function serviceCrew(order: JsonObject, serviceId: string): string[] {
  const plans = (Array.isArray(order.serviceSchedules) ? order.serviceSchedules : []).filter(isObject);
  if (plans.length) {
    const plan = plans.find((item) => String(item.id || "") === serviceId);
    return Array.isArray(plan?.installerIds) ? plan.installerIds.map(String) : [];
  }
  const lineId = serviceId.startsWith("line:") ? serviceId.slice(5) : "";
  const line = (Array.isArray(order.extraServices) ? order.extraServices : [])
    .filter(isObject)
    .find((item) => String(item.id || "") === lineId);
  if (Array.isArray(line?.installerIds) && line.installerIds.length) return line.installerIds.map(String);
  return Array.isArray(order.installerIds) ? order.installerIds.map(String) : [];
}

/**
 * A field specialist marks the progress of their own services only (Owner,
 * 2026-10-10). Only the requested status is taken from the browser; who and
 * when are stamped here from the signed-in specialist and the server clock.
 */
function mergeFieldServiceProgress(
  currentOrder: JsonObject,
  submitted: unknown,
  identityIds: Set<string>,
  events: JsonObject[] = [],
  now = new Date().toISOString(),
): JsonObject {
  const result: JsonObject = isObject(currentOrder.serviceProgress) ? clone(currentOrder.serviceProgress) : {};
  if (!isObject(submitted)) return result;
  // Only the project's own services are marked.
  const services = new Set(serviceGroupIds(currentOrder));
  for (const serviceId of new Set([...Object.keys(result), ...Object.keys(submitted)])) {
    if (!services.has(serviceId)) continue;
    const actor = serviceCrew(currentOrder, serviceId).find((member) => identityIds.has(member));
    if (!actor) continue;
    const before = isObject(result[serviceId]) ? (result[serviceId] as JsonObject) : null;
    const requested = isObject(submitted[serviceId]) ? String((submitted[serviceId] as JsonObject).status || "") : "";
    // Reopening a done service is the manager's call.
    if (before?.status === "done") continue;
    if (requested === String(before?.status || "")) continue;
    if (requested === "in_progress") {
      result[serviceId] = { status: "in_progress", startedAt: before?.startedAt || now, startedBy: before?.startedBy || actor };
      events.push({ at: now, key: "service_started", by: actor, serviceId });
    } else if (requested === "done") {
      result[serviceId] = { status: "done", startedAt: before?.startedAt || now, startedBy: before?.startedBy || actor, doneAt: now, doneBy: actor };
      events.push({ at: now, key: "service_done", by: actor, serviceId });
    }
    // Anything else (a missing or unknown status) keeps the saved mark: a
    // started service is not taken back from the field.
  }
  return result;
}

export function mergeFieldWorkspace(
  currentPayload: JsonObject,
  submittedPayload: JsonObject,
  roles: readonly string[],
  legacyUserIds: readonly string[],
) {
  const identityIds = fieldIdentityIds(currentPayload, roles, legacyUserIds);
  const currentOrders = (Array.isArray(currentPayload.orders) ? currentPayload.orders : []).filter(isObject);
  const submittedOrders = new Map(
    (Array.isArray(submittedPayload.orders) ? submittedPayload.orders : [])
      .filter(isObject)
      .map((order) => [String(order.id || ""), order]),
  );
  const allowedStatuses = allowedFieldStatuses(roles);
  const assignedOrders = currentOrders.filter((order) => orderAssignedTo(order, identityIds, roles));
  const orderIds = new Set(assignedOrders.map((order) => String(order.id || "")));
  const clientIds = new Set(assignedOrders.map((order) => String(order.clientId || "")).filter(Boolean));

  const mergedOrders = currentOrders.map((currentOrder) => {
    if (!orderAssignedTo(currentOrder, identityIds, roles)) return currentOrder;
    const submitted = submittedOrders.get(String(currentOrder.id || ""));
    if (!submitted) return currentOrder;

    const next = clone(currentOrder);
    const serviceEvents: JsonObject[] = [];
    for (const key of MUTABLE_ORDER_FIELDS) {
      if (!(key in submitted)) continue;
      if (key === "productionStages") {
        next.productionStages = mergeFieldProductionStages(currentOrder, submitted.productionStages, identityIds);
        continue;
      }
      if (key === "status") {
        const status = String(submitted.status || "");
        if (allowedStatuses.has(status)) next.status = status;
        continue;
      }
      if (key === "serviceProgress") {
        next.serviceProgress = mergeFieldServiceProgress(currentOrder, submitted.serviceProgress, identityIds, serviceEvents);
        continue;
      }
      if (key === "timeline") {
        const currentTimeline = Array.isArray(currentOrder.timeline) ? currentOrder.timeline : [];
        const submittedTimeline = redactFinancialData(submitted.timeline, "timeline");
        const protectedEvents = currentTimeline.filter(
          (event) => isObject(event) && FINANCIAL_TIMELINE_KEYS.has(String(event.key || "")),
        );
        next.timeline = [
          ...(Array.isArray(submittedTimeline) ? submittedTimeline : []),
          ...clone(protectedEvents),
        ].sort((a, b) =>
          String(isObject(a) ? a.at || "" : "").localeCompare(String(isObject(b) ? b.at || "" : "")),
        );
        continue;
      }
      next[key] = mergeOperationalValue(currentOrder[key], submitted[key]);
    }
    // The work of a done service is not changed from the field: only a
    // manager reopens it. Restore only completed-service windows so legitimate
    // edits to other, unfinished services survive a stale field save.
    if (!CLOSED_STATUSES.has(String(currentOrder.status)) && isObject(currentOrder.serviceProgress)) {
      const savedProgress = currentOrder.serviceProgress;
      const touched = serviceGroupIds(currentOrder).some((id) =>
        isObject(savedProgress[id]) && savedProgress[id].status === "done" && serviceGroupScope(currentOrder, id) !== serviceGroupScope(next, id));
      if (touched) restoreCompletedServiceMeasurements(currentOrder, next);
    }
    // A closed project is reopened by a manager, not by a field save from a
    // browser that has not seen it close.
    if (CLOSED_STATUSES.has(String(currentOrder.status)) && !CLOSED_STATUSES.has(String(next.status))) next.status = currentOrder.status;
    // The service marks in the history, and the project steps they make, come
    // from the accepted marks, named and dated here; the browser's own copies
    // of them are not taken, and a browser that has not seen them keeps them.
    const serverEvent = (event: unknown) =>
      isObject(event) && (SERVICE_TIMELINE_KEYS.has(String(event.key || "")) || event.source === "services");
    const timeline: unknown[] = [
      ...(Array.isArray(next.timeline) ? next.timeline : []).filter((event) => !serverEvent(event)),
      ...clone((Array.isArray(currentOrder.timeline) ? currentOrder.timeline : []).filter(serverEvent)),
      ...serviceEvents.map((event) => ({ ...event, note: serviceGroupName(next, String(event.serviceId), currentPayload) })),
    ].sort((a, b) => String(isObject(a) ? a.at || "" : "").localeCompare(String(isObject(b) ? b.at || "" : "")));
    next.timeline = timeline;
    // The project follows its services, whatever the browser sent: the last
    // service done closes it, a service begun keeps it under way.
    // Only the project's current services date it (a service that left keeps
    // its mark until the server drops it).
    const services = new Set(serviceGroupIds(next));
    const currentProgress = Object.entries(isObject(next.serviceProgress) ? next.serviceProgress : {})
      .filter(([id, entry]) => services.has(id) && isObject(entry))
      .map(([, entry]) => entry as JsonObject);
    if (projectServicesFinished(next, currentPayload)) {
      const last = [...currentProgress]
        .sort((a, b) => String(a.doneAt || "").localeCompare(String(b.doneAt || "")))
        .pop();
      next.status = "installation_done";
      timeline.push({ at: last?.doneAt, key: "installation_done", by: last?.doneBy, note: "Все услуги выполнены", source: "services" });
    } else if (projectServicesStarted(next)) {
      // A stale save of a project already under way only keeps its status.
      const restarted = currentOrder.status !== "installation_in_progress";
      next.status = "installation_in_progress";
      if (restarted) timeline.push({ at: new Date().toISOString(), key: "installation_in_progress", by: serviceEvents[0]?.by ?? [...identityIds][0], source: "services" });
    }
    // A field close is announced, and its film written off, by the
    // owner/manager CRM that claims this mark (a field CRM cannot send staff
    // notices or change stock).
    if (CLOSED_STATUSES.has(String(next.status)) && !CLOSED_STATUSES.has(String(currentOrder.status))) next.servicesClosedNotice = "pending";
    // Closing through the services: the completion date is the last service's
    // server-stamped time, not a submitted one.
    if (CLOSED_STATUSES.has(String(next.status)) && !CLOSED_STATUSES.has(String(currentOrder.status))) {
      const doneTimes = currentProgress
        .map((entry) => String(entry.doneAt || ""))
        .filter(Boolean)
        .sort();
      if (doneTimes.length) next.installationDoneAt = doneTimes[doneTimes.length - 1];
    }
    return next;
  });

  const currentTasks = (Array.isArray(currentPayload.tasks) ? currentPayload.tasks : []).filter(isObject);
  const submittedTasks = new Map(
    (Array.isArray(submittedPayload.tasks) ? submittedPayload.tasks : [])
      .filter(isObject)
      .map((task) => [String(task.id || ""), task]),
  );
  const taskAssigned = (task: JsonObject) => {
    const teamIds = Array.isArray(task.teamIds) ? task.teamIds.map(String) : [];
    return (
      identityIds.has(String(task.responsibleId || "")) ||
      teamIds.some((id) => identityIds.has(id)) ||
      orderIds.has(String(task.orderId || "")) ||
      clientIds.has(String(task.clientId || ""))
    );
  };
  const mergedTasks = currentTasks.flatMap((currentTask) => {
    if (!taskAssigned(currentTask)) return [currentTask];
    const submitted = submittedTasks.get(String(currentTask.id || ""));
    if (!submitted) {
      return identityIds.has(String(currentTask.createdBy || "")) ? [] : [currentTask];
    }
    const next = clone(currentTask);
    if (submitted.status === "open" || submitted.status === "done") next.status = submitted.status;
    if ("doneAt" in submitted) next.doneAt = submitted.doneAt;
    if (typeof submitted.notes === "string") next.notes = submitted.notes;
    return [next];
  });
  const existingTaskIds = new Set(currentTasks.map((task) => String(task.id || "")));
  for (const submitted of submittedTasks.values()) {
    if (existingTaskIds.has(String(submitted.id || ""))) continue;
    const teamIds = Array.isArray(submitted.teamIds) ? submitted.teamIds.map(String) : [];
    const responsibleId = String(submitted.responsibleId || "");
    const clientId = String(submitted.clientId || "");
    if (
      !identityIds.has(String(submitted.createdBy || "")) ||
      !identityIds.has(responsibleId) ||
      teamIds.some((id) => !identityIds.has(id)) ||
      (clientId && !clientIds.has(clientId))
    ) continue;
    mergedTasks.push(clone(redactFinancialData(submitted)) as JsonObject);
  }

  return { ...clone(currentPayload), orders: mergedOrders, tasks: mergedTasks };
}

export function hasFieldWorkspaceRole(roles: readonly string[]) {
  return roles.some((role) => role === ROLE_CODES.CONSULTANT || role === ROLE_CODES.INSTALLER);
}

export function hasUsableFieldIdentity(payload: JsonObject, roles: readonly string[], ids: readonly string[]) {
  return [...fieldIdentityIds(payload, roles, ids)].some((id) => {
    const user = (Array.isArray(payload.users) ? payload.users : []).find(
      (candidate) => isObject(candidate) && String(candidate.id || "") === id,
    );
    return isObject(user) && FIELD_ROLE_NAMES.has(String(user.role || ""));
  });
}
