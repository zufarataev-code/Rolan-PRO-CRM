import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { normalizePhoneE164 } from "@/features/google-ads/normalization";
import { persistLeadAttribution } from "@/features/google-ads/attribution";
import { OPEN_LEAD_STATUS_CODES } from "@/features/sales/lead-claim";
import { legacyProjectsIncludingArchive } from "@/features/legacy-crm/project-archive";
import { CALLRAIL_ACTION, CallrailError, type CallrailCall } from "./callrail-core";

export async function importCallrailCall(call: CallrailCall) {
  return prisma.$transaction(async tx => {
    // Locks plus the durable receipt make retries and simultaneous calls safe.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('callrail-call'), hashtext(${call.call_key}))`;
    if (call.phone) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('callrail-phone'), hashtext(${call.phone}))`;
    const receipt = await tx.activityLog.findFirst({ where: { action_key: CALLRAIL_ACTION, metadata: { path: ["call_key"], equals: call.call_key } }, select: { entity_id: true } });
    if (receipt) return { lead_id: receipt.entity_id, duplicate: true, created: false };
    const candidates = call.phone ? await tx.lead.findMany({
      where: { phone: { not: null } },
      select: { lead_id: true, phone: true, external_source: true, pipeline_status: { select: { status_code: true } } },
    }) : [];
    const matches = candidates.filter(lead => normalizePhoneE164(lead.phone) === call.phone);
    let eligible = matches.filter(lead => OPEN_LEAD_STATUS_CODES.includes(lead.pipeline_status.status_code));
    if (!eligible.length && matches.length) {
      const workspace = await tx.legacyWorkspace.findUnique({ where: { workspace_id: "primary" }, select: { payload: true } });
      const legacyIds = new Set(legacyProjectsIncludingArchive((workspace?.payload || {}) as Record<string, unknown>).map(order => order.canonicalLeadId));
      const native = await tx.deal.findMany({ where: { lead_id: { in: matches.map(lead => lead.lead_id) }, projects: { some: {} } }, select: { lead_id: true } });
      eligible = matches.filter(lead => lead.external_source !== "callrail_review" && (legacyIds.has(lead.lead_id) || native.some(deal => deal.lead_id === lead.lead_id)));
    }
    // A dismissed enquiry without a project cannot swallow a new incoming call.
    const reviews = eligible.filter(lead => lead.external_source === "callrail_review");
    let lead: { lead_id: string; phone: string | null } | null = reviews.length === 1 ? reviews[0] : eligible.length === 1 ? eligible[0] : null;
    const ambiguous = !lead && eligible.length > 1;
    const created = !lead;
    const message = `CallRail: ${call.source} · ${call.call_type} · ${call.duration}s · ${call.started_at}${call.campaign ? ` · ${call.campaign}` : ""}`;
    if (!lead) {
      const status = await tx.pipelineStatus.findUnique({ where: { status_code: "NEW_LEAD" }, select: { pipeline_status_id: true } });
      if (!status) throw new CallrailError("missing_pipeline_status", "NEW_LEAD is not configured.", 503);
      lead = await tx.lead.create({ data: {
        name: call.name, phone: call.phone, source: "callrail",
        external_source: ambiguous ? "callrail_review" : "callrail", external_submission_id: call.call_key,
        pipeline_status_id: status.pipeline_status_id, notes: (ambiguous ? "Общий номер: проверьте клиента и проект перед оформлением.\n" : "") + message, created_at: new Date(call.started_at),
      }, select: { lead_id: true, phone: true } });
      if (!ambiguous) await persistLeadAttribution(tx, lead.lead_id, call.attribution);
    }
    // Existing source, contact, consent, acquisition, assignment and stage stay intact.
    const { phone: _phone, name: _name, attribution: _attribution, ...metadata } = call;
    await tx.activityLog.create({ data: { entity_type: "lead", entity_id: lead.lead_id, action_key: CALLRAIL_ACTION, message, metadata: { ...metadata, ambiguous_contact: ambiguous || reviews.length > 0 } as Prisma.InputJsonValue } });
    return { lead_id: lead.lead_id, duplicate: false, created };
  });
}

/** Only pass lead IDs already authorized by normal lead scope. */
export async function callrailHistory(leadIds: string[]) {
  if (!leadIds.length) return new Map<string, Array<{ occurred_at: string; message: string }>>();
  const rows = await prisma.activityLog.findMany({ where: { action_key: CALLRAIL_ACTION, entity_type: "lead", entity_id: { in: leadIds } }, orderBy: { created_at: "asc" }, select: { entity_id: true, message: true, metadata: true } });
  const history = new Map<string, Array<{ occurred_at: string; message: string }>>();
  for (const row of rows) {
    const items = history.get(row.entity_id!) || [];
    items.push({ occurred_at: String((row.metadata as Record<string, unknown>).started_at), message: row.message });
    history.set(row.entity_id!, items);
  }
  return history;
}
