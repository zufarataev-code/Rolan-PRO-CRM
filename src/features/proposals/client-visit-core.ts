// Owner, 2026-11-01: «клиент не может отменить назначение монтажа или замера —
// ссылка ведёт его внутрь CRM». The client's only public page is the proposal
// link, so the next visit and the reschedule / cancel request live there. The
// request lands in the CRM project (clientRequests) for the manager to decide.

type Row = Record<string, any>;
export type VisitType = "consultation" | "measure" | "install";
export type PublicVisit = {
  type: VisitType;
  at: string;
  address: string;
  pending: { type: "reschedule" | "cancel"; requested_at: string | null; created_at: string } | null;
};

const FIELD: Record<VisitType, string> = { consultation: "consultationAt", measure: "measurementAt", install: "installationAt" };
const TITLE: Record<VisitType, string> = { consultation: "Консультация", measure: "Замер", install: "Монтаж" };
const INSTALL_STATUSES = ["proposal_accepted", "installation_scheduled", "installation_accepted", "installation_en_route", "installation_in_progress"];

/** The client's next visit, as the CRM portal chooses it (orderClientActiveEvent). */
export function nextVisit(order: Row | null | undefined, now = new Date()): { type: VisitType; at: string } | null {
  if (!order || order.status === "cancelled") return null;
  const candidates: VisitType[] = [];
  if (["new", "consultation_scheduled"].includes(order.status) && order.consultationAt) candidates.push("consultation");
  if (["new", "consultation_scheduled", "measurement_scheduled"].includes(order.status) && order.measurementAt) candidates.push("measure");
  if (INSTALL_STATUSES.includes(order.status) && order.installationAt) candidates.push("install");
  // A draft install plan at «КП принято» is not a date the client was told.
  const confirmed = candidates.filter(type => !(type === "install" && order.status === "proposal_accepted" && Array.isArray(order.serviceSchedules) && order.serviceSchedules.length));
  const dated = confirmed
    .map(type => ({ type, at: String(order[FIELD[type]]) }))
    .filter(item => !Number.isNaN(Date.parse(item.at)) && Date.parse(item.at) >= now.getTime() - 12 * 3600 * 1000)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return dated[0] || null;
}

function pendingRequest(order: Row, type: VisitType) {
  const open = (Array.isArray(order.clientRequests) ? order.clientRequests : []).filter((r: Row) => (!r.status || r.status === "new") && r.eventType === type);
  const last = open[open.length - 1];
  return last ? { type: last.type === "cancel" ? "cancel" as const : "reschedule" as const, requested_at: last.requestedAt || null, created_at: String(last.createdAt || "") } : null;
}

function orderAddress(order: Row, client: Row | undefined) {
  const own = order.address || [order.addressStreet, order.addressCity, order.addressState, order.addressZip].filter(Boolean).join(", ");
  return String(own || client?.address || "");
}

export function publicVisitFromPayload(payload: Row, orderId: string, now = new Date()): PublicVisit | null {
  const order = (Array.isArray(payload?.orders) ? payload.orders : []).find((item: Row) => item?.id === orderId);
  const visit = nextVisit(order, now);
  if (!order || !visit) return null;
  const client = (Array.isArray(payload.clients) ? payload.clients : []).find((item: Row) => item?.id === order.clientId);
  return { ...visit, address: orderAddress(order, client), pending: pendingRequest(order, visit.type) };
}

export type VisitChangeInput = { action: "reschedule" | "cancel"; requestedAt?: string | null; reason: string };
export type VisitChangeError = "not_found" | "no_visit" | "already_requested" | "invalid_time" | "invalid_reason";

/** Adds the client's request to the project; the manager confirms or calls back. */
export function applyVisitChange(payload: Row, orderId: string, input: VisitChangeInput, now = new Date()): VisitChangeError | PublicVisit {
  const reason = String(input.reason || "").trim().slice(0, 500);
  if (reason.length < 2) return "invalid_reason";
  const order = (Array.isArray(payload.orders) ? payload.orders : []).find((item: Row) => item?.id === orderId);
  if (!order) return "not_found";
  const visit = nextVisit(order, now);
  if (!visit) return "no_visit";
  if (pendingRequest(order, visit.type)) return "already_requested";
  let requestedAt: string | null = null;
  if (input.action === "reschedule") {
    const at = Date.parse(String(input.requestedAt || ""));
    if (Number.isNaN(at) || at < now.getTime() || at > now.getTime() + 366 * 24 * 3600 * 1000) return "invalid_time";
    requestedAt = new Date(at).toISOString();
  }
  const createdAt = now.toISOString();
  const id = `cr_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  order.clientRequests = Array.isArray(order.clientRequests) ? order.clientRequests : [];
  order.clientRequests.push({ id, type: input.action, eventType: visit.type, currentAt: visit.at, requestedAt, reason, status: "new", createdAt, source: "proposal_page" });
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  order.timeline.push({ at: createdAt, key: input.action === "cancel" ? "client_cancel_requested" : "client_reschedule_requested", by: order.clientId || null, note: `${TITLE[visit.type]}: ${reason}` });
  const client = (Array.isArray(payload.clients) ? payload.clients : []).find((item: Row) => item?.id === order.clientId);
  const owners = (Array.isArray(payload.users) ? payload.users : []).filter((user: Row) => user?.role === "owner" && user.active !== false).map((user: Row) => user.id);
  const recipients = [...new Set([order.managerId, ...owners].filter(Boolean))];
  payload.notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
  for (const userId of recipients) {
    payload.notifications.push({
      id: `n_${id}_${userId}`, userId,
      title: input.action === "cancel" ? "Клиент просит отмену" : "Клиент просит перенос",
      body: `${client?.name || "Клиент"} · ${order.number || ""} · ${TITLE[visit.type]}`,
      link: `#/order/${order.id}`, readAt: null, createdAt,
    });
  }
  return { ...visit, address: orderAddress(order, client), pending: pendingRequest(order, visit.type) };
}

