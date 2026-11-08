import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import { persistLeadAttribution } from "@/features/google-ads/attribution";
import { sendLeadFirstTouch } from "@/features/sales/lead-first-touch";
import { MetaLeadError, normalizeMetaLead, type MetaLeadNotification } from "./meta-lead-ads-core";

const SOURCE = "meta_lead_ads";
export async function importMetaLead(notification: MetaLeadNotification, token: string, appSecret: string) {
  const where = { external_source_external_submission_id: { external_source: SOURCE, external_submission_id: notification.lead_id } };
  // A retry of a committed lead needs neither a fresh token nor another provider read.
  const existing = await prisma.lead.findUnique({ where, select: { lead_id: true } });
  if (existing) return { lead_id: existing.lead_id, duplicate: true };
  const url = new URL(`https://graph.facebook.com/v26.0/${notification.lead_id}`);
  url.searchParams.set("fields", "id,created_time,form_id,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform,is_organic");
  url.searchParams.set("appsecret_proof", createHmac("sha256", appSecret).update(token).digest("hex"));
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  // Keep Graph responses, tokens and contact data out of HTTP errors and logs.
  if (!response.ok) throw new MetaLeadError("lead_retrieval_failed", 503);
  const lead = normalizeMetaLead(await response.json(), notification);
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('meta-lead-ads'), hashtext(${notification.lead_id}))`;
    const duplicate = await tx.lead.findUnique({ where, select: { lead_id: true } });
    if (duplicate) return { lead_id: duplicate.lead_id, duplicate: true };
    const status = await tx.pipelineStatus.findUnique({ where: { status_code: "NEW_LEAD" }, select: { pipeline_status_id: true } });
    if (!status) throw new MetaLeadError("missing_pipeline_status", 503);
    const { metadata, createdAt, ...contact } = lead;
    const created = await tx.lead.create({ data: { ...contact, source: SOURCE, external_source: SOURCE, external_submission_id: notification.lead_id, pipeline_status_id: status.pipeline_status_id, created_at: createdAt }, select: { lead_id: true } });
    await persistLeadAttribution(tx, created.lead_id, {
      utmSource: metadata.platform || "meta", utmMedium: metadata.is_organic === true ? "organic_social" : metadata.ad_id ? "paid_social" : "social",
      utmCampaign: metadata.campaign_name || metadata.campaign_id, utmTerm: metadata.adset_name || metadata.adset_id,
      utmContent: metadata.ad_name || metadata.ad_id, sessionAttributes: metadata, capturedAt: createdAt,
      consent: { adUserData: "UNKNOWN", adPersonalization: "UNKNOWN", audienceMarketingEligible: false, source: SOURCE },
    });
    await tx.activityLog.create({ data: { entity_type: "lead", entity_id: created.lead_id, action_key: "integration.meta_lead_ads.received", message: "Meta instant form enquiry received.", metadata } });
    return { lead_id: created.lead_id, duplicate: false };
  });
  // First touch happens after commit; it never throws, so a failed SMS cannot make Meta retry.
  if (!result.duplicate) {
    await sendLeadFirstTouch({ leadId: result.lead_id, name: lead.name, phone: lead.phone, channel: "meta_lead_ads" });
  }
  return result;
}
