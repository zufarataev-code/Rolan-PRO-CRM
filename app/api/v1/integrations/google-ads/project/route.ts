import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { findAcquisitionTouchpoint, normalizeAdsId, persistLeadAttribution } from "@/features/google-ads/attribution";
import { googleAdsProjectMoney } from "@/features/google-ads/campaign-report";
import { prisma } from "@/lib/db";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";

/** Owner reviews attribution/cost facts; no money total or consent is invented here. */
export async function POST(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Google Ads project review is owner-only.");
  const body = await request.json().catch(() => null);
  if (!body || typeof body.order_id !== "string" || !["bind_campaign", "confirm_costs"].includes(body.operation)) return apiError(400, "invalid_payload", "An order_id and supported operation are required.");
  const workspace = await prisma.legacyWorkspace.findUnique({ where: { workspace_id: "primary" } });
  const payload = structuredClone(workspace?.payload || {}) as Record<string, any>;
  const order = (payload.orders || []).find((item: Record<string, any>) => item.id === body.order_id);
  if (!workspace || !order) return apiError(404, "project_not_found", "Project not found.");
  if (body.operation === "confirm_costs") {
    const money = googleAdsProjectMoney(order, payload);
    if (money.issues.length) return apiError(400, "costs_incomplete", "Complete the recorded job, warehouse issue and actual expenses before reviewing costs.", { issues: money.issues });
    if (body.cost_fingerprint !== money.fingerprint) return apiError(409, "costs_changed", "Project costs changed; refresh and review the current amounts.");
    order.googleAdsCostsReview = { fingerprint: money.fingerprint, reviewed_at: new Date().toISOString(), reviewed_by: auth.session.user.user_id };
    const saved = await prisma.legacyWorkspace.updateMany({ where: { workspace_id: "primary", revision: workspace.revision }, data: { payload, revision: { increment: 1 }, updated_by: auth.session.user.user_id } });
    if (saved.count !== 1) return apiError(409, "revision_conflict", "CRM changed in another browser; refresh before reviewing.");
    return apiSuccess({ confirmed: true });
  }
  if (body.ad_user_data === "GRANTED" && (typeof body.consent_evidence !== "string" || !body.consent_evidence.trim())) return apiError(400, "consent_evidence_required", "Record the source of the existing client consent.");
  const customerId = normalizeAdsId(body.customer_id, 20), campaignId = normalizeAdsId(body.campaign_id);
  if (!customerId || !campaignId) return apiError(400, "invalid_campaign", "Numeric Google Ads customer_id and campaign_id are required.");
  const campaign = await prisma.googleAdsDailyCost.findFirst({ where: { customer_id: customerId, campaign_id: campaignId } });
  if (!campaign) return apiError(400, "unknown_campaign", "Import this campaign's costs before linking a project.");
  const existing = await prisma.acquisitionTouchpoint.findUnique({ where: { legacy_order_id: order.id } });
  if (existing) return apiError(409, "attribution_already_recorded", "Original acquisition is already recorded and cannot be silently reassigned.");
  const client = (payload.clients || []).find((item: Record<string, any>) => item.id === order.clientId);
  const status = await prisma.pipelineStatus.findUnique({ where: { status_code: "NEW_LEAD" } });
  if (!status) return apiError(503, "pipeline_not_configured", "NEW_LEAD is not configured.");
  const capturedAt = new Date(order.createdAt);
  if (Number.isNaN(capturedAt.getTime())) return apiError(400, "acquisition_date_missing", "The original project creation date is required.");
  try {
    const result = await prisma.$transaction(async tx => {
      const claim = await tx.legacyWorkspace.updateMany({ where: { workspace_id: "primary", revision: workspace.revision }, data: { revision: { increment: 1 } } });
      if (claim.count !== 1) throw new Error("attribution_revision_conflict");
      const lead = order.canonicalLeadId ? await tx.lead.findUniqueOrThrow({ where: { lead_id: order.canonicalLeadId } }) : await tx.lead.upsert({
        where: { external_source_external_submission_id: { external_source: "legacy_order", external_submission_id: order.id } }, update: {},
        create: { name: String(client?.name || order.number || order.id).slice(0, 160), phone: typeof client?.phone === "string" ? client.phone.slice(0, 40) : null, email: typeof client?.email === "string" ? client.email.slice(0, 191) : null, source: "google_ads", external_source: "legacy_order", external_submission_id: order.id, pipeline_status_id: status.pipeline_status_id, created_at: capturedAt },
      });
      const original = await findAcquisitionTouchpoint(tx, { lead_id: lead.lead_id });
      const capture = await persistLeadAttribution(tx, lead.lead_id, {
        googleAdsCustomerId: customerId, googleAdsCampaignId: campaignId, capturedAt: original?.captured_at ?? capturedAt,
        gclid: typeof body.gclid === "string" && body.gclid.trim() ? body.gclid : original?.gclid,
        gbraid: original?.gbraid, wbraid: original?.wbraid,
        utmSource: "google", utmMedium: "cpc", source: "owner_verified_project",
        sessionAttributes: { source_channel: body.source_channel === "PHONE" ? "PHONE" : "WEB" },
        consent: body.ad_user_data === "GRANTED" ? { adUserData: "GRANTED", adPersonalization: "UNKNOWN", audienceMarketingEligible: false, source: body.consent_evidence.slice(0, 100) } : null,
      });
      await tx.acquisitionTouchpoint.update({ where: { acquisition_touchpoint_id: capture.acquisitionTouchpointId! }, data: { legacy_order_id: order.id } });
      return { acquisition_touchpoint_id: capture.acquisitionTouchpointId };
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof Error && error.message === "attribution_revision_conflict") return apiError(409, "revision_conflict", "CRM changed; refresh before linking attribution.");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(409, "attribution_already_recorded", "Original acquisition was already recorded.");
    throw error;
  }
}
