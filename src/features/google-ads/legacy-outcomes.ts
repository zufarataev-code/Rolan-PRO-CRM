import { legacyProjectsIncludingArchive } from "@/features/legacy-crm/project-archive";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureClosedWonConversion, ensureQualifiedLeadConversion } from "./conversion-events";
import { createConversionAdjustment } from "./conversion-adjustments";

type Row = Record<string, any>;

export function legacyGoogleAdsSale(order: Row) {
  const accepted = (Array.isArray(order.timeline) ? order.timeline : []).find((item: Row) => item.key === "accepted_by_payment");
  const amount = Number(order.projectEstimateSnapshot?.revenue);
  const date = new Date(accepted?.at || "");
  const paid = Array.isArray(order.payments) && order.payments.length
    ? order.payments.reduce((total: number, payment: Row) => total + (Number(payment.amount) || 0), 0) : Number(order.paid);
  return accepted && !Number.isNaN(date.getTime()) && order.depositReceived === true && paid > 0 && Number.isFinite(amount) && amount > 0
    ? { occurredAt: date, conversionValue: new Prisma.Decimal(amount) } : null;
}

/** Bridge verified legacy workflow facts into the existing immutable events/outboxes. Never calls Google. */
export async function reconcileLegacyGoogleAdsOutcomes() {
  const workspace = await prisma.legacyWorkspace.findUnique({ where: { workspace_id: "primary" }, select: { payload: true } });
  const payload = (workspace?.payload || {}) as Row;
  const orders: Row[] = legacyProjectsIncludingArchive(payload);
  const points = await prisma.acquisitionTouchpoint.findMany({
    where: { OR: [{ legacy_order_id: { not: null } }, { lead_id: { in: orders.map(order => order.canonicalLeadId).filter(value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) } }] },
    orderBy: { captured_at: "asc" },
  });
  let recorded = 0, failed = 0;
  for (const order of orders) {
    const point = points.find(item => item.legacy_order_id === order.id)
      ?? points.find(item => item.lead_id === order.canonicalLeadId && (item.gclid || item.gbraid || item.wbraid || item.google_ads_campaign_id));
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`google-ads:legacy:${order.id}`}))`;
        if (point) {
          const deal = await tx.deal.findFirst({ where: { legacy_order_id: order.id }, orderBy: { created_at: "asc" } });
          for (const [stage, key] of [["CONSULTATION_SCHEDULED", "consultation_scheduled"], ["PROPOSAL_SENT", "proposal_sent"]]) {
            const fact = (Array.isArray(order.timeline) ? order.timeline : []).find((item: Row) => item.key === key);
            const at = new Date(fact?.at || "");
            if (!Number.isNaN(at.getTime())) await ensureQualifiedLeadConversion(tx, { dealId: deal?.deal_id, leadId: point.lead_id, clientId: point.client_id, attributionTouchpointId: point.acquisition_touchpoint_id, pipelineStatusCode: stage, occurredAt: at, eventSource: "OTHER" });
          }
          const sale = legacyGoogleAdsSale(order);
          if (sale) {
            await ensureClosedWonConversion(tx, { ...sale, dealId: deal?.deal_id, legacyOrderId: order.id, leadId: point.lead_id, clientId: point.client_id, attributionTouchpointId: point.acquisition_touchpoint_id, currency: "USD", eventSource: (point.session_attributes as Row)?.source_channel === "PHONE" ? "PHONE" : "OTHER" });
            recorded += 1;
          }
        }
        const original = await tx.conversionEvent.findFirst({ where: { event_type: "converted_lead", OR: [{ transaction_id: `crm-project-${order.id}-sale` }, { deal: { legacy_order_id: order.id } }] }, orderBy: { created_at: "asc" } });
        if (!original || original.conversion_value === null) return;
        const refunds: Row[] = (Array.isArray(payload.finance?.transactions) ? payload.finance.transactions : []).filter((item: Row) => item.orderId === order.id && item.type === "expense" && item.category === "refund");
        const refunded = refunds.reduce<Prisma.Decimal>((total, item) => total.plus(new Prisma.Decimal(Math.abs(Number(item.amount) || 0))), new Prisma.Decimal(0));
        const cancelled = ["cancelled", "canceled", "lost"].includes(order.status);
        if (!cancelled && !refunded.gt(0)) return;
        const remaining = Prisma.Decimal.max(0, original.conversion_value.minus(refunded));
        const retract = cancelled || remaining.eq(0);
        const latest = await tx.conversionAdjustment.findFirst({ where: { conversion_event_id: original.conversion_event_id }, orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }] });
        if (latest?.adjustment_type === "RETRACTION" || (!retract && latest?.adjustment_type === "RESTATEMENT" && latest.adjusted_value?.eq(remaining))) return;
        const revision = await tx.conversionAdjustment.count({ where: { conversion_event_id: original.conversion_event_id } });
        await createConversionAdjustment(tx, {
          conversionEventId: original.conversion_event_id,
          financialReferenceId: `legacy-project-${order.id}-revision-${revision + 1}`,
          adjustmentType: retract ? "RETRACTION" : "RESTATEMENT",
          ...(retract ? {} : { adjustedValue: remaining }),
          currency: original.currency, occurredAt: new Date(), reason: cancelled ? "Project cancelled in CRM" : "Recorded customer refunds",
        });
      });
    } catch (error) {
      failed += 1;
      console.error("[google-ads] legacy project reconciliation failed", { project_id: order.id, code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "invalid_project_outcome" });
    }
  }
  return { recorded, failed };
}
