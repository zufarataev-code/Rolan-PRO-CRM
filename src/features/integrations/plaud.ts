import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { createFieldWorkspace, isPrivilegedLegacyWorkspaceRole } from "@/features/legacy-crm/field-workspace";
import { legacyProjectsIncludingArchive } from "@/features/legacy-crm/project-archive";
import { fetchPlaudEmails } from "@/features/gmail/service";
import { PLAUD_ACTION, PLAUD_ENTITY, PlaudError, matchPlaudRecording, plaudRecordingFromEmail, type PlaudRecording } from "./plaud-core";

type JsonRecord = Record<string, unknown>;

/** Stores a Plaud recording once and links it to a project when the match is unambiguous. */
export async function importPlaudRecording(rec: PlaudRecording) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('plaud-recording'), hashtext(${rec.recording_key}))`;
    const existing = await tx.activityLog.findFirst({
      where: { action_key: PLAUD_ACTION, metadata: { path: ["recording_key"], equals: rec.recording_key } },
      select: { activity_id: true, metadata: true },
    });
    if (existing) return { id: existing.activity_id, duplicate: true, order_id: (existing.metadata as JsonRecord)?.order_id ?? null };
    const workspace = await tx.legacyWorkspace.findUnique({ where: { workspace_id: "primary" }, select: { payload: true } });
    const payload = (workspace?.payload || {}) as JsonRecord;
    const match = matchPlaudRecording(rec, payload, legacyProjectsIncludingArchive(payload));
    const row = await tx.activityLog.create({
      data: {
        entity_type: PLAUD_ENTITY,
        action_key: PLAUD_ACTION,
        message: rec.title,
        metadata: {
          ...rec,
          order_id: match?.order_id ?? null,
          order_number: match?.order_number ?? null,
          match_reason: match?.reason ?? null,
          applied_at: null,
        } as Prisma.InputJsonValue,
      },
      select: { activity_id: true },
    });
    return { id: row.activity_id, duplicate: false, order_id: match?.order_id ?? null, match_reason: match?.reason ?? null };
  });
}

/**
 * Codex review #506: transcripts are client conversations. Owner/manager see all;
 * a field employee sees only recordings of projects in their own field workspace.
 * Returns null for «everything».
 */
export async function plaudViewerOrderIds(roles: readonly string[], legacyUserIds: readonly string[]) {
  if (isPrivilegedLegacyWorkspaceRole(roles)) return null;
  const workspace = await prisma.legacyWorkspace.findUnique({ where: { workspace_id: "primary" }, select: { payload: true } });
  const field = createFieldWorkspace((workspace?.payload || {}) as JsonRecord, roles, legacyUserIds) as JsonRecord;
  return new Set((Array.isArray(field.orders) ? field.orders : []).map(order => String((order as JsonRecord).id)));
}

export async function plaudRecordingOrderId(id: string) {
  const row = await prisma.activityLog.findFirst({ where: { activity_id: id, action_key: PLAUD_ACTION }, select: { metadata: true } });
  if (!row) return undefined;
  const orderId = (row.metadata as JsonRecord | null)?.order_id;
  return typeof orderId === "string" ? orderId : null;
}

export type PlaudRecordingView = {
  id: string;
  title: string;
  recorded_at: string | null;
  received_at: string;
  duration_sec: number | null;
  summary: string;
  transcript: string;
  order_id: string | null;
  order_number: string | null;
  match_reason: string | null;
  applied_at: string | null;
};

function view(row: { activity_id: string; message: string; metadata: unknown }): PlaudRecordingView {
  const m = (row.metadata || {}) as JsonRecord;
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    id: row.activity_id,
    title: row.message,
    recorded_at: str(m.recorded_at),
    received_at: str(m.received_at) || "",
    duration_sec: typeof m.duration_sec === "number" ? m.duration_sec : null,
    summary: str(m.summary) || "",
    transcript: str(m.transcript) || "",
    order_id: str(m.order_id),
    order_number: str(m.order_number),
    match_reason: str(m.match_reason),
    applied_at: str(m.applied_at),
  };
}

/** Recordings of one project, or the unassigned inbox (`orderId` = null). */
export async function listPlaudRecordings(orderId: string | null, limit = 30) {
  const rows = await prisma.activityLog.findMany({
    where: { action_key: PLAUD_ACTION, metadata: { path: ["order_id"], equals: orderId === null ? Prisma.JsonNull : orderId } },
    orderBy: { created_at: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: { activity_id: true, message: true, metadata: true },
  });
  return rows.map(view);
}

/** Manual link from the unassigned inbox, or «заполнено» stamp after the AI fill. */
export async function updatePlaudRecording(id: string, change: { orderId?: string | null; applied?: boolean }, actorUserId: string | null) {
  return prisma.$transaction(async tx => {
    const row = await tx.activityLog.findFirst({ where: { activity_id: id, action_key: PLAUD_ACTION }, select: { activity_id: true, message: true, metadata: true } });
    if (!row) throw new PlaudError("not_found", "Recording not found.", 404);
    const metadata = { ...((row.metadata || {}) as JsonRecord) };
    if (change.orderId !== undefined) {
      if (change.orderId) {
        const workspace = await tx.legacyWorkspace.findUnique({ where: { workspace_id: "primary" }, select: { payload: true } });
        const order = legacyProjectsIncludingArchive((workspace?.payload || {}) as JsonRecord).find(item => String(item.id) === change.orderId);
        if (!order) throw new PlaudError("order_not_found", "Project not found.", 404);
        metadata.order_id = String(order.id);
        metadata.order_number = String(order.number || "");
      } else {
        metadata.order_id = null;
        metadata.order_number = null;
      }
      metadata.match_reason = change.orderId ? "manual" : null;
      metadata.applied_at = null;
    }
    if (change.applied) metadata.applied_at = new Date().toISOString();
    const updated = await tx.activityLog.update({
      where: { activity_id: row.activity_id },
      data: { metadata: metadata as Prisma.InputJsonValue, actor_user_id: actorUserId ?? undefined },
      select: { activity_id: true, message: true, metadata: true },
    });
    return view(updated);
  });
}

let lastEmailSync = 0;
/**
 * Free route (Owner, 2026-11-12: «Zapier платный — можно иначе»): recordings sent to
 * info+plaud@… are pulled from the connected Gmail, at most once a minute, when
 * someone opens a measurement window. Failures never block the CRM.
 */
export async function syncPlaudEmails(now = Date.now()) {
  if (now - lastEmailSync < 60_000) return { skipped: true, imported: 0 };
  lastEmailSync = now;
  try {
    const known = new Set((await prisma.activityLog.findMany({
      where: { action_key: PLAUD_ACTION, created_at: { gte: new Date(now - 15 * 864e5) }, metadata: { path: ["recording_key"], string_starts_with: "gmail-" } },
      select: { metadata: true },
    })).map(row => String((row.metadata as JsonRecord)?.recording_key)));
    const { messages } = await fetchPlaudEmails(id => known.has(`gmail-${id}`));
    let imported = 0;
    for (const mail of messages) {
      if (!mail.body.trim() && !mail.attachmentsText.length) continue;
      const result = await importPlaudRecording(plaudRecordingFromEmail(mail));
      if (!result.duplicate) imported += 1;
    }
    return { skipped: false, imported };
  } catch (error) {
    console.warn("plaud_email_sync_failed", error instanceof Error ? error.message : "unknown");
    return { skipped: false, imported: 0 };
  }
}
