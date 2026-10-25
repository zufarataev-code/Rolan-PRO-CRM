import { createHmac, timingSafeEqual } from "node:crypto";

import { Prisma } from "@prisma/client";

import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";

const WORKSPACE_ID = "primary";
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 365;

type LegacyRecord = Record<string, any>;

export type PublicAppointment = {
  orderNumber: string;
  clientName: string;
  eventType: "consultation" | "measure" | "install";
  eventTitle: string;
  scheduledAt: string;
  address: string;
  pendingRequest: {
    type: "reschedule" | "cancel";
    requestedAt: string | null;
    reason: string;
    createdAt: string;
  } | null;
};

type AppointmentTokenPayload = {
  v: 1;
  orderId: string;
  exp: number;
};

const EVENT_INFO = {
  consultation: { title: "Консультация", field: "consultationAt" },
  measure: { title: "Замер", field: "measurementAt" },
  install: { title: "Монтаж", field: "installationAt" },
} as const;

function tokenSignature(payload: string) {
  return createHmac("sha256", getEnv().authSecret).update(payload).digest("base64url");
}

export function createPublicAppointmentToken(orderId: string, now = Date.now()) {
  const payload: AppointmentTokenPayload = {
    v: 1,
    orderId,
    exp: Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${tokenSignature(encoded)}`;
}

export function readPublicAppointmentToken(token: string, now = Date.now()) {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;
  const expectedSignature = tokenSignature(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AppointmentTokenPayload;
    if (payload.v !== 1 || typeof payload.orderId !== "string" || !payload.orderId) return null;
    if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function activeAppointmentForOrder(order: LegacyRecord) {
  const candidates: Array<PublicAppointment["eventType"]> = [];
  if (["new", "consultation_scheduled"].includes(order.status) && order.consultationAt) candidates.push("consultation");
  if (["new", "consultation_scheduled", "measurement_scheduled"].includes(order.status) && order.measurementAt) candidates.push("measure");
  if (["proposal_accepted", "installation_scheduled", "installation_accepted", "installation_en_route", "installation_in_progress"].includes(order.status) && order.installationAt) candidates.push("install");

  return candidates
    .map((eventType) => ({ eventType, ...EVENT_INFO[eventType], scheduledAt: order[EVENT_INFO[eventType].field] as string }))
    .filter((event) => event.scheduledAt && !Number.isNaN(Date.parse(event.scheduledAt)))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt))[0] ?? null;
}

function orderAddress(order: LegacyRecord, client: LegacyRecord) {
  return String(
    order.objectAddress || order.address || order.siteAddress ||
    order.addressSnapshot?.address || client.address || "",
  ).trim();
}

function publicAppointmentFromPayload(payload: LegacyRecord, orderId: string): PublicAppointment | null {
  const order = Array.isArray(payload.orders) ? payload.orders.find((item: LegacyRecord) => item?.id === orderId) : null;
  if (!order) return null;
  const event = activeAppointmentForOrder(order);
  if (!event) return null;
  const client = Array.isArray(payload.clients)
    ? payload.clients.find((item: LegacyRecord) => item?.id === order.clientId) ?? {}
    : {};
  const pending = Array.isArray(order.clientRequests)
    ? order.clientRequests.find((request: LegacyRecord) => (!request.status || request.status === "new") && request.eventType === event.eventType)
    : null;
  return {
    orderNumber: String(order.number || order.id),
    clientName: String(client.name || "Клиент"),
    eventType: event.eventType,
    eventTitle: event.title,
    scheduledAt: event.scheduledAt,
    address: orderAddress(order, client),
    pendingRequest: pending ? {
      type: pending.type === "cancel" ? "cancel" : "reschedule",
      requestedAt: pending.requestedAt || null,
      reason: String(pending.reason || ""),
      createdAt: String(pending.createdAt || ""),
    } : null,
  };
}

export async function getPublicAppointment(token: string) {
  const parsed = readPublicAppointmentToken(token);
  if (!parsed) return null;
  const workspace = await prisma.legacyWorkspace.findUnique({
    where: { workspace_id: WORKSPACE_ID },
    select: { payload: true },
  });
  if (!workspace) return null;
  return publicAppointmentFromPayload(workspace.payload as LegacyRecord, parsed.orderId);
}

export type AppointmentRequestInput = {
  type: "reschedule" | "cancel";
  requestedAt?: string | null;
  reason: string;
};

export async function submitPublicAppointmentRequest(token: string, input: AppointmentRequestInput) {
  const parsed = readPublicAppointmentToken(token);
  if (!parsed) return { ok: false as const, code: "invalid_link" };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const workspace = await prisma.legacyWorkspace.findUnique({ where: { workspace_id: WORKSPACE_ID } });
    if (!workspace) return { ok: false as const, code: "not_found" };
    const payload = structuredClone(workspace.payload) as LegacyRecord;
    const order = Array.isArray(payload.orders)
      ? payload.orders.find((item: LegacyRecord) => item?.id === parsed.orderId)
      : null;
    if (!order) return { ok: false as const, code: "not_found" };
    const event = activeAppointmentForOrder(order);
    if (!event) return { ok: false as const, code: "no_active_appointment" };

    order.clientRequests = Array.isArray(order.clientRequests) ? order.clientRequests : [];
    const pending = order.clientRequests.find((request: LegacyRecord) =>
      (!request.status || request.status === "new") && request.eventType === event.eventType,
    );
    if (pending) return { ok: true as const, appointment: publicAppointmentFromPayload(payload, parsed.orderId) };

    const createdAt = new Date().toISOString();
    const request = {
      id: `client_request_${crypto.randomUUID()}`,
      type: input.type,
      eventType: event.eventType,
      currentAt: event.scheduledAt,
      requestedAt: input.type === "reschedule" ? input.requestedAt : null,
      reason: input.reason,
      status: "new",
      createdAt,
    };
    order.clientRequests.push(request);
    order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
    order.timeline.push({
      at: createdAt,
      key: input.type === "cancel" ? "client_cancel_requested" : "client_reschedule_requested",
      by: order.clientId || null,
      note: `${event.title}: ${input.reason}`,
    });

    const client = Array.isArray(payload.clients)
      ? payload.clients.find((item: LegacyRecord) => item?.id === order.clientId)
      : null;
    const recipients = new Set<string>();
    if (order.managerId) recipients.add(order.managerId);
    for (const user of Array.isArray(payload.users) ? payload.users : []) {
      if (user?.role === "owner" && user.id) recipients.add(user.id);
    }
    payload.notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
    for (const userId of recipients) {
      payload.notifications.push({
        id: `notification_${crypto.randomUUID()}`,
        userId,
        title: input.type === "cancel" ? "Клиент просит отмену" : "Клиент просит перенос",
        body: `${client?.name || "Клиент"} · ${order.number || order.id} · ${event.title}`,
        link: `#/order/${order.id}`,
        readAt: null,
        createdAt,
      });
    }

    const updated = await prisma.legacyWorkspace.updateMany({
      where: { workspace_id: WORKSPACE_ID, revision: workspace.revision },
      data: {
        payload: payload as Prisma.InputJsonValue,
        revision: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      return { ok: true as const, appointment: publicAppointmentFromPayload(payload, parsed.orderId) };
    }
  }

  return { ok: false as const, code: "revision_conflict" };
}

export async function createAppointmentLinkForOrder(orderId: string, allowedManagerIds: string[] | null = null) {
  const workspace = await prisma.legacyWorkspace.findUnique({
    where: { workspace_id: WORKSPACE_ID },
    select: { payload: true },
  });
  const payload = workspace?.payload as LegacyRecord | undefined;
  const order = Array.isArray(payload?.orders)
    ? payload.orders.find((item: LegacyRecord) => item?.id === orderId)
    : null;
  if (!order || !activeAppointmentForOrder(order)) return null;
  if (allowedManagerIds && !allowedManagerIds.includes(order.managerId)) return null;
  const token = createPublicAppointmentToken(orderId);
  return { token };
}
