import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { normalizePhoneE164, sha256Hex } from "@/features/google-ads/normalization";
import { persistLeadAttribution } from "@/features/google-ads/attribution";
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
      select: { lead_id: true, phone: true },
    }) : [];
    const matches = candidates.filter(lead => normalizePhoneE164(lead.phone) === call.phone);
    // A repeat caller stays attached to the original project even after intake.
    // Shared numbers get one review enquiry, never another one for every call.
    const reviewKey = call.phone ? sha256Hex(call.phone) : "";
    const review = reviewKey ? await tx.lead.findUnique({ where: { external_source_external_submission_id: { external_source: "callrail_review", external_submission_id: reviewKey } }, select: { lead_id: true, phone: true } }) : null;
    let lead = review || (matches.length === 1 ? matches[0] : null);
    const created = !lead;
    const message = `CallRail: ${call.source} · ${call.call_type} · ${call.duration}s · ${call.started_at}${call.campaign ? ` · ${call.campaign}` : ""}`;
    if (!lead) {
      const status = await tx.pipelineStatus.findUnique({ where: { status_code: "NEW_LEAD" }, select: { pipeline_status_id: true } });
      if (!status) throw new CallrailError("missing_pipeline_status", "NEW_LEAD is not configured.", 503);
      lead = await tx.lead.create({ data: {
        name: call.name, phone: call.phone, source: "callrail",
        external_source: matches.length > 1 ? "callrail_review" : "callrail", external_submission_id: matches.length > 1 ? reviewKey : call.call_key,
        pipeline_status_id: status.pipeline_status_id, notes: (matches.length > 1 ? "Общий номер: проверьте клиента и проект перед оформлением.\n" : "") + message, created_at: new Date(call.started_at),
      }, select: { lead_id: true, phone: true } });
      await persistLeadAttribution(tx, lead.lead_id, call.attribution);
    }
    // Existing source, contact, consent, acquisition, assignment and stage stay intact.
    const { phone: _phone, name: _name, attribution: _attribution, ...metadata } = call;
    await tx.activityLog.create({ data: { entity_type: "lead", entity_id: lead.lead_id, action_key: CALLRAIL_ACTION, message, metadata: { ...metadata, ambiguous_contact: matches.length > 1 } as Prisma.InputJsonValue } });
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
