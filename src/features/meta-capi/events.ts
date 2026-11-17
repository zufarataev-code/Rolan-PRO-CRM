import type { Prisma } from "@prisma/client";
import { buildMetaCrmPayload, META_STAGE_EVENTS } from "./payload";

type StageInput = { leadId: string; stageCode: string; occurredAt: Date; eventId?: string };

export async function enqueueLeadStage(tx: Prisma.TransactionClient, input: StageInput) {
  const eventName = ["NEW_LEAD", "LEAD"].includes(input.stageCode) ? "LeadReopened" : META_STAGE_EVENTS[input.stageCode];
  if (!eventName || input.stageCode === "CLOSED_WON") return null;
  const eventId = ["Lead", "QualifiedLead"].includes(eventName)
    ? `crm-lead-${input.leadId}-${eventName}`
    : `crm-stage-${input.eventId ?? `${input.leadId}-${input.stageCode}-${input.occurredAt.getTime()}`}`;
  return enqueue(tx, { ...input, eventName, eventId });
}

export function enqueueLeadReceived(tx: Prisma.TransactionClient, input: { leadId: string; occurredAt: Date }) {
  return enqueue(tx, { ...input, eventName: "Lead", eventId: `crm-lead-${input.leadId}-Lead` });
}

export function enqueueQualifiedLead(tx: Prisma.TransactionClient, input: { leadId: string; occurredAt: Date }) {
  return enqueueLeadStage(tx, { ...input, stageCode: "QUALIFIED" });
}

export async function enqueueConvertedLead(tx: Prisma.TransactionClient, input: { conversionEventId: string }) {
  const event = await tx.conversionEvent.findUnique({ where: { conversion_event_id: input.conversionEventId }, include: { adjustments: { select: { adjustment_type: true } } } });
  if (!event || event.event_type !== "converted_lead" || !event.lead_id || event.adjustments.some(item => item.adjustment_type === "RETRACTION")) return null;
  return enqueue(tx, {
    leadId: event.lead_id, eventName: "ConvertedLead", eventId: event.transaction_id,
    occurredAt: event.occurred_at, conversionEventId: event.conversion_event_id,
    value: event.conversion_value === null ? undefined : Number(event.conversion_value), currency: event.currency,
  });
}

async function enqueue(tx: Prisma.TransactionClient, input: { leadId: string; eventName: string; eventId: string; occurredAt: Date; conversionEventId?: string; value?: number; currency?: string }) {
  const lead = await tx.lead.findUnique({ where: { lead_id: input.leadId }, include: { consent_snapshots: { where: { effective_at: { lte: input.occurredAt } }, orderBy: [{ effective_at: "desc" }, { created_at: "desc" }], take: 1 } } });
  if (!lead) return null;
  if (input.eventName !== "Lead" && lead.external_source === "meta_lead_ads") {
    const receipt = await tx.activityLog.findFirst({ where: { entity_type: "lead", entity_id: lead.lead_id, action_key: "integration.meta_lead_ads.received" }, orderBy: { created_at: "asc" }, select: { created_at: true } });
    if (receipt) await enqueue(tx, { leadId: lead.lead_id, eventName: "Lead", eventId: `crm-lead-${lead.lead_id}-Lead`, occurredAt: receipt.created_at });
  }
  const consent = lead.consent_snapshots[0];
  const source = lead.external_source === "rolanpro.com" && lead.source === "website"
    ? "website" : lead.external_source || (lead.source === "meta_lead_ads" ? null : lead.source);
  const { payload, reason } = buildMetaCrmPayload({
    source, nativeLeadId: lead.external_submission_id, email: lead.email, phone: lead.phone,
    consent: consent?.ad_personalization === "DENIED" ? "DENIED" : consent?.ad_user_data ?? "UNKNOWN", eventName: input.eventName,
    eventId: input.eventId, occurredAt: input.occurredAt, generatedAt: lead.created_at, value: input.value, currency: input.currency,
  });
  return tx.metaCapiOutbox.upsert({
    where: { event_id: input.eventId }, update: {},
    create: {
      lead_id: lead.lead_id, conversion_event_id: input.conversionEventId, event_id: input.eventId,
      event_name: input.eventName, occurred_at: input.occurredAt,
      ...(payload ? { payload_snapshot: payload as unknown as Prisma.InputJsonValue } : {}),
      processing_status: payload ? "queued" : "suppressed", last_error_code: reason,
    },
  });
}
