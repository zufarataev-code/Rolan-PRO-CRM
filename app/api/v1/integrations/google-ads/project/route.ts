import { legacyProjectsIncludingArchive } from "@/features/legacy-crm/project-archive";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { normalizeAdsId, persistLeadAttribution } from "@/features/google-ads/attribution";
import { linkProjectConversionAttribution } from "@/features/google-ads/conversion-events";
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
  if (!body || typeof body.order_id !== "string" || !["bind_campaign", "confirm_costs", "link_expense"].includes(body.operation)) return apiError(400, "invalid_payload", "An order_id and supported operation are required.");
  const workspace = await prisma.legacyWorkspace.findUnique({ where: { workspace_id: "primary" } });
  const payload = structuredClone(workspace?.payload || {}) as Record<string, any>;
  const order = legacyProjectsIncludingArchive(payload).find(item => item.id === body.order_id) as Record<string, any> | undefined;
  if (!workspace || !order) return apiError(404, "project_not_found", "Project not found.");
  if (body.operation === "link_expense") {
    if (typeof body.transaction_id !== "string" || body.expense_id !== null && typeof body.expense_id !== "string") return apiError(400, "invalid_expense_link", "A bank entry and expense link are required.");
    const transaction = (payload.finance?.transactions || []).find((item: Record<string, any>) => item.id === body.transaction_id && item.orderId === order.id && item.type === "expense");
    const expense = (order.extraExpenses || []).find((item: Record<string, any>) => item.id === body.expense_id && (item.actual === true || item.paid === true || item.paidAt));
    if (!transaction || body.expense_id !== null && !expense) return apiError(400, "invalid_expense_link", "Choose an existing project expense or explicitly mark this bank entry as separate.");
    transaction.projectExpenseId = body.expense_id;
    const saved = await prisma.legacyWorkspace.updateMany({ where: { workspace_id: "primary", revision: workspace.revision }, data: { payload, revision: { increment: 1 }, updated_by: auth.session.user.user_id } });
    return saved.count === 1 ? apiSuccess({ linked: true }) : apiError(409, "revision_conflict", "CRM changed; refresh before linking costs.");
  }
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
  const status = await prisma.pipelineStatus.findUnique({ where: { status_code: "CONTACTED" } });
  if (!status) return apiError(503, "pipeline_not_configured", "CONTACTED is not configured.");
  const capturedAt = new Date(order.createdAt);
  if (Number.isNaN(capturedAt.getTime())) return apiError(400, "acquisition_date_missing", "The original project creation date is required.");
  try {
    const result = await prisma.$transaction(async tx => {
      const claim = await tx.legacyWorkspace.updateMany({ where: { workspace_id: "primary", revision: workspace.revision }, data: { revision: { increment: 1 } } });
      if (claim.count !== 1) throw new Error("attribution_revision_conflict");
      const deals = await tx.deal.findMany({ where: { legacy_order_id: order.id }, select: { lead_id: true, attribution_touchpoint: { select: { lead_id: true } }, conversion_events: { select: { lead_id: true, attribution_touchpoint: { select: { lead_id: true } } } } } });
      const projectEvents = await tx.conversionEvent.findMany({ where: { business_object_type: "legacy_order", business_object_id: order.id }, select: { lead_id: true, attribution_touchpoint: { select: { lead_id: true } } } });
      const knownLeadIds = [
        order.canonicalLeadId,
        ...deals.flatMap(deal => [deal.lead_id, deal.attribution_touchpoint?.lead_id, ...deal.conversion_events.flatMap(event => [event.lead_id, event.attribution_touchpoint?.lead_id])]),
        ...projectEvents.flatMap(event => [event.lead_id, event.attribution_touchpoint?.lead_id]),
      ];
      const leadIds = [...new Set(knownLeadIds.filter((id): id is string => typeof id === "string" && !!id))];
      if (leadIds.length > 1) throw new Error("attribution_lead_conflict");
      const lead = leadIds[0] ? await tx.lead.findUniqueOrThrow({ where: { lead_id: leadIds[0] } }) : await tx.lead.upsert({
        where: { external_source_external_submission_id: { external_source: "legacy_order", external_submission_id: order.id } }, update: {},
        create: { name: String(client?.name || order.number || order.id).slice(0, 160), phone: typeof client?.phone === "string" ? client.phone.slice(0, 40) : null, email: typeof client?.email === "string" ? client.email.slice(0, 191) : null, source: "google_ads", external_source: "legacy_order", external_submission_id: order.id, pipeline_status_id: status.pipeline_status_id, created_at: capturedAt },
      });
      const originalLeadPoint = await tx.acquisitionTouchpoint.findFirst({ where: { lead_id: lead.lead_id, google_ads_customer_id: { not: null }, google_ads_campaign_id: { not: null } }, orderBy: { captured_at: "asc" } });
      if (originalLeadPoint) throw new Error("attribution_already_recorded");
      const original = await tx.acquisitionTouchpoint.findFirst({
        where: { lead_id: lead.lead_id, OR: [{ gclid: { not: null } }, { gbraid: { not: null } }, { wbraid: { not: null } }] },
        orderBy: { captured_at: "asc" },
      });
      const capture = await persistLeadAttribution(tx, lead.lead_id, {
        googleAdsCustomerId: customerId, googleAdsCampaignId: campaignId, capturedAt: original?.captured_at ?? lead.created_at,
        gclid: original?.gclid ?? (typeof body.gclid === "string" && body.gclid.trim() ? body.gclid : null),
        gbraid: original?.gbraid, wbraid: original?.wbraid,
        utmSource: "google", utmMedium: "cpc", source: "owner_verified_project",
        sessionAttributes: { source_channel: body.source_channel === "PHONE" ? "PHONE" : "WEB" },
        consent: body.ad_user_data === "GRANTED" ? { adUserData: "GRANTED", adPersonalization: "UNKNOWN", audienceMarketingEligible: false, source: body.consent_evidence.slice(0, 100) } : null,
      });
      order.canonicalLeadId = lead.lead_id;
      await tx.legacyWorkspace.update({ where: { workspace_id: "primary" }, data: { payload } });
      await tx.acquisitionTouchpoint.update({ where: { acquisition_touchpoint_id: capture.acquisitionTouchpointId! }, data: { legacy_order_id: order.id } });
      await linkProjectConversionAttribution(tx, { legacyOrderId: order.id, leadId: lead.lead_id, attributionTouchpointId: capture.acquisitionTouchpointId! });
      return { acquisition_touchpoint_id: capture.acquisitionTouchpointId };
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof Error && error.message === "attribution_revision_conflict") return apiError(409, "revision_conflict", "CRM changed; refresh before linking attribution.");
    if (error instanceof Error && error.message === "attribution_lead_conflict") return apiError(409, "original_lead_conflict", "Existing project records disagree about the original lead; review them before linking attribution.");
    if (error instanceof Error && error.message === "attribution_already_recorded") return apiError(409, "attribution_already_recorded", "Original acquisition is already recorded and cannot be silently reassigned.");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(409, "attribution_already_recorded", "Original acquisition was already recorded.");
    throw error;
  }
}
