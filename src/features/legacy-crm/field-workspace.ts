import { ROLE_CODES } from "@/lib/auth/constants";

type JsonObject = Record<string, unknown>;

const FIELD_ROLE_NAMES = new Set(["measurer", "installer"]);
const FINANCIAL_KEY = /(?:price|retail|wholesale|cost|margin|profit|revenue|lifetimevalue|paid|payment|deposit|debt|invoice|commission|discount|tax|subtotal|saleamount|refund|overhead|targetprofit|payout|ratepersqft|amount)/i;
const FINANCIAL_TIMELINE_KEYS = new Set([
  "deposit_received",
  "payment_received",
  "stripe_paid",
  "payout_paid",
  "stripe_link_created",
  "invoice_sent",
  "premium_proposal_accepted",
]);

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
  "updatedAt",
]);

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
  const roleNames = legacyRoleNames(roles);
  const users = Array.isArray(payload.users) ? payload.users : [];
  return new Set(
    users
      .filter(
        (user) =>
          isObject(user) &&
          legacyUserIds.includes(String(user.id || "")) &&
          roleNames.has(String(user.role || "")),
      )
      .map((user) => String((user as JsonObject).id)),
  );
}

function orderAssignedTo(order: JsonObject, identityIds: Set<string>) {
  if (identityIds.has(String(order.measurerId || ""))) return true;
  return Array.isArray(order.installerIds)
    ? order.installerIds.some((id) => identityIds.has(String(id)))
    : false;
}

function safeUser(user: JsonObject, own: boolean) {
  const result: JsonObject = {
    id: user.id,
    role: user.role,
    name: user.name,
    title: user.title,
    phone: user.phone,
    email: user.email,
    lang: user.lang,
    active: user.active,
    photo: user.photo,
  };

  // An installer may see their own configured work rates, never another
  // employee's compensation settings.
  if (own && user.role === "installer") result.payConfig = clone(user.payConfig || {});
  return result;
}

function safeSettings(settings: JsonObject) {
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
  const assignedOrders = allOrders.filter((order) => orderAssignedTo(order, identityIds));
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
    .map((user) => safeUser(user, identityIds.has(String(user.id || ""))));
  const clients = (Array.isArray(payload.clients) ? payload.clients : [])
    .filter(isObject)
    .filter((client) => clientIds.has(String(client.id || "")))
    .map((client) => redactFinancialData(clone(client)));
  const settings = isObject(payload.settings) ? safeSettings(payload.settings) : {};

  return {
    _allowedLegacyUserIds: [...identityIds],
    users,
    clients,
    orders: assignedOrders.map((order) => redactFinancialData(clone(order))),
    notifications: (Array.isArray(payload.notifications) ? payload.notifications : [])
      .filter(isObject)
      .filter(linkedRecord)
      .map((record) => redactFinancialData(clone(record))),
    tasks: (Array.isArray(payload.tasks) ? payload.tasks : [])
      .filter(isObject)
      .filter(linkedRecord)
      .map((record) => redactFinancialData(clone(record))),
    reviews: [],
    settings,
    geocache: clone(payload.geocache || {}),
    schemaVersion: payload.schemaVersion,
  };
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
  const assignedOrders = currentOrders.filter((order) => orderAssignedTo(order, identityIds));
  const orderIds = new Set(assignedOrders.map((order) => String(order.id || "")));
  const clientIds = new Set(assignedOrders.map((order) => String(order.clientId || "")).filter(Boolean));

  const mergedOrders = currentOrders.map((currentOrder) => {
    if (!orderAssignedTo(currentOrder, identityIds)) return currentOrder;
    const submitted = submittedOrders.get(String(currentOrder.id || ""));
    if (!submitted) return currentOrder;

    const next = clone(currentOrder);
    for (const key of MUTABLE_ORDER_FIELDS) {
      if (!(key in submitted)) continue;
      if (key === "status") {
        const status = String(submitted.status || "");
        if (allowedStatuses.has(status)) next.status = status;
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
