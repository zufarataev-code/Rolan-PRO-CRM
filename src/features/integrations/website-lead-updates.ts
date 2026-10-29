import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const WEBSITE_UPDATE_ACTION = "integration.website.lead_update";
const SOURCE = "rolanpro.com";
export class WebsiteUpdateError extends Error {
  constructor(public code: string, message: string, public status = 400, public currentRevision?: number) { super(message); }
}
function invalid(code: string, message: string): never { throw new WebsiteUpdateError(code, message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("invalid_payload", "A JSON object is required.");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid("invalid_fields", "Unsupported update fields.");
}
function text(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) invalid(`invalid_${field}`, `${field} must be a nonempty string of at most ${max} characters.`);
  return value.trim();
}
export function normalizeWebsiteUpdate(input: unknown) {
  const body = object(input);
  keys(body, ["submission_id", "event_id", "revision", "occurred_at", "contact", "follow_up"]);
  const submissionId = text(body.submission_id, "submission_id", 191);
  const eventId = text(body.event_id, "event_id", 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(eventId)) invalid("invalid_event_id", "event_id must be a UUID.");
  if (typeof body.revision !== "number" || !Number.isInteger(body.revision) || body.revision < 1 || body.revision > 2147483647) invalid("invalid_revision", "revision must be a positive 32-bit integer.");
  const occurredAt = text(body.occurred_at, "occurred_at", 64);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt) || Number.isNaN(Date.parse(occurredAt)) || new Date(occurredAt.slice(0, 10) + "T00:00:00Z").toISOString().slice(0, 10) !== occurredAt.slice(0, 10)) invalid("invalid_occurred_at", "occurred_at must be an ISO timestamp with timezone.");
  const contactInput = body.contact === undefined ? {} : object(body.contact);
  keys(contactInput, ["name", "phone", "email"]);
  const contact: { name?: string; phone?: string; email?: string } = {};
  if (contactInput.name !== undefined) contact.name = text(contactInput.name, "name", 160).replace(/\s+/g, " ");
  if (contactInput.phone !== undefined) {
    contact.phone = text(contactInput.phone, "phone", 40);
    if (!/^[0-9+().\s#xX-]{3,40}$/.test(contact.phone)) invalid("invalid_phone", "phone is invalid.");
  }
  if (contactInput.email !== undefined) {
    contact.email = text(contactInput.email, "email", 191).toLowerCase();
    if (!/^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(contact.email)) invalid("invalid_email", "email is invalid.");
  }
  const followUp = object(body.follow_up);
  keys(followUp, ["kind", "message"]);
  if (followUp.kind !== "quote_updated" && followUp.kind !== "callback_requested") invalid("invalid_kind", "Unsupported follow-up kind.");
  return { submission_id: submissionId, event_id: eventId, revision: body.revision, occurred_at: new Date(occurredAt).toISOString(), contact, follow_up: { kind: followUp.kind, message: text(followUp.message, "message", 16000) } };
}
export function websiteUpdateFingerprint(update: ReturnType<typeof normalizeWebsiteUpdate>) {
  // Normalization constructs a stable, allowlisted field order, independent of JSON key order.
  return createHash("sha256").update(JSON.stringify(update)).digest("hex");
}

export async function applyWebsiteUpdate(input: unknown) {
  const update = normalizeWebsiteUpdate(input);
  const eventKey = `${SOURCE}:${update.event_id}`;
  const hash = websiteUpdateFingerprint(update);
  return prisma.$transaction(async tx => {
    // Event lock also prevents a UUID being used concurrently against two leads.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('website-update-event'), hashtext(${eventKey}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('website-update-submission'), hashtext(${update.submission_id}))`;
    const lead = await tx.lead.findUnique({ where: { external_source_external_submission_id: { external_source: SOURCE, external_submission_id: update.submission_id } } });
    if (!lead) throw new WebsiteUpdateError("initial_submission_missing", "Original website submission must arrive first.", 409, 0);
    const rows = await tx.activityLog.findMany({ where: { action_key: WEBSITE_UPDATE_ACTION, entity_id: lead.lead_id }, select: { metadata: true } });
    const currentRevision = rows.reduce((max, row) => Math.max(max, Number((row.metadata as Record<string, unknown> | null)?.revision) || 0), 0);
    const existing = await tx.activityLog.findFirst({ where: { action_key: WEBSITE_UPDATE_ACTION, metadata: { path: ["event_key"], equals: eventKey } }, select: { entity_id: true, metadata: true } });
    if (existing) {
      if (existing.entity_id !== lead.lead_id || (existing.metadata as Record<string, unknown>)?.payload_hash !== hash) throw new WebsiteUpdateError("idempotency_conflict", "event_id was already used for a different update.", 409, currentRevision);
      return { ok: true, lead_id: lead.lead_id, event_id: update.event_id, revision: update.revision, current_revision: currentRevision, duplicate: true, applied: false };
    }
    if (update.revision <= currentRevision) throw new WebsiteUpdateError("revision_conflict", "This revision already belongs to another event.", 409, currentRevision);
    if (update.revision !== currentRevision + 1) throw new WebsiteUpdateError("revision_gap", "An earlier website update must arrive first.", 409, currentRevision);
    // No business-stage, note, assignment, acquisition or consent write is permitted here.
    if (Object.keys(update.contact).length) {
      const { name, ...contact } = update.contact;
      let identity: { name?: string; first_name?: string | null; last_name?: string | null } = {};
      if (name && lead.customer_type === "B2B") {
        // contact.name is the person, never the company's display name. Use
        // the same first-token/remainder convention as clientIdentityFromLead.
        const parts = name.split(" "), firstName = parts[0], lastName = parts.slice(1).join(" ");
        if (firstName.length > 80 || lastName.length > 80) invalid("invalid_name", "Business contact name parts must be at most 80 characters.");
        identity = { first_name: firstName, last_name: lastName || null };
      } else if (name) identity = { name, first_name: null, last_name: null };
      await tx.lead.update({ where: { lead_id: lead.lead_id }, data: { ...contact, ...identity } });
    }
    const title = update.follow_up.kind === "callback_requested" ? "Запрос обратного звонка с сайта" : "Уточнение заявки с сайта";
    const contactText = Object.entries(update.contact).map(([key, value]) => `${key}: ${value}`).join("\n");
    await tx.activityLog.create({ data: {
      entity_type: "lead", entity_id: lead.lead_id, action_key: WEBSITE_UPDATE_ACTION,
      message: [title, contactText, update.follow_up.message].filter(Boolean).join("\n"),
      metadata: { provider: "website", external_source: SOURCE, submission_id: update.submission_id, event_key: eventKey, event_id: update.event_id, payload_hash: hash, revision: update.revision, occurred_at: update.occurred_at, kind: update.follow_up.kind, before_image_source: "observed_before_update", before_contact: { name: lead.name, first_name: lead.first_name, last_name: lead.last_name, phone: lead.phone, email: lead.email }, contact: update.contact } as Prisma.InputJsonValue,
    } });
    return { ok: true, lead_id: lead.lead_id, event_id: update.event_id, revision: update.revision, current_revision: update.revision, duplicate: false, applied: true };
  });
}

/** Call only with lead IDs already authorized by the normal lead scope. */
export async function websiteUpdateHistory(leadIds: string[]) {
  if (!leadIds.length) return new Map<string, Array<{ revision: number; occurred_at: string; received_at: string; message: string }>>();
  const rows = await prisma.activityLog.findMany({ where: { action_key: WEBSITE_UPDATE_ACTION, entity_type: "lead", entity_id: { in: leadIds } }, orderBy: { created_at: "asc" }, select: { entity_id: true, created_at: true, message: true, metadata: true } });
  const history = new Map<string, Array<{ revision: number; occurred_at: string; received_at: string; message: string }>>();
  for (const row of rows) {
    const meta = row.metadata as Record<string, unknown>;
    const items = history.get(row.entity_id!) || [];
    items.push({ revision: Number(meta.revision), occurred_at: String(meta.occurred_at), received_at: row.created_at.toISOString(), message: row.message });
    history.set(row.entity_id!, items);
  }
  for (const items of history.values()) items.sort((a, b) => a.revision - b.revision);
  return history;
}
