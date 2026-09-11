import { Prisma } from "@prisma/client";

export const GOOGLE_ADS_DEFAULT_SETTING_KEY = "default";
export const GOOGLE_ADS_CONVERTED_LEAD_EVENT = "converted_lead";

function saleTransactionId(dealId: string) {
  return `crm-deal-${dealId}-sale`;
}

export type ClosedWonConversionInput = {
  dealId: string;
  leadId?: string | null;
  clientId?: string | null;
  attributionTouchpointId?: string | null;
  occurredAt: Date;
  conversionValue: Prisma.Decimal | null;
  currency: string;
  eventSource?: string;
};

/**
 * Persists the immutable business outcome and, when a Google destination is
 * configured, its delivery row in the caller's transaction. Google is never
 * called from this function, so an Ads outage cannot block the CRM stage move.
 */
export async function ensureClosedWonConversion(
  tx: Prisma.TransactionClient,
  input: ClosedWonConversionInput,
) {
  const transactionId = saleTransactionId(input.dealId);
  const settings = await tx.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    select: {
      conversion_owner_customer_id: true,
      converted_lead_action_id: true,
      rule_version: true,
      value_basis: true,
      sale_milestone: true,
    },
  });

  const event = await tx.conversionEvent.upsert({
    where: { transaction_id: transactionId },
    update: {},
    create: {
      lead_id: input.leadId ?? null,
      client_id: input.clientId ?? null,
      deal_id: input.dealId,
      business_object_type: "deal",
      business_object_id: input.dealId,
      event_type: GOOGLE_ADS_CONVERTED_LEAD_EVENT,
      occurred_at: input.occurredAt,
      event_source: input.eventSource ?? "OTHER",
      conversion_value: input.conversionValue,
      currency: input.currency.toUpperCase().slice(0, 3) || "USD",
      attribution_touchpoint_id: input.attributionTouchpointId ?? null,
      transaction_id: transactionId,
      rule_version: settings?.rule_version ?? "v1",
      payload_snapshot: {
        milestone: settings?.sale_milestone ?? "CLOSED_WON",
        value_basis: settings?.value_basis ?? "ACTUAL_SALE_REVENUE",
        delivery_configuration_present: Boolean(
          settings?.conversion_owner_customer_id && settings?.converted_lead_action_id,
        ),
      },
    },
  });

  if (!settings?.conversion_owner_customer_id || !settings.converted_lead_action_id) {
    return {
      event,
      outbox: null,
      deliveryState: "awaiting_configuration" as const,
    };
  }

  const outbox = await tx.conversionUploadOutbox.upsert({
    where: {
      destination_account_id_action_id_transaction_id: {
        destination_account_id: settings.conversion_owner_customer_id,
        action_id: settings.converted_lead_action_id,
        transaction_id: transactionId,
      },
    },
    update: {},
    create: {
      conversion_event_id: event.conversion_event_id,
      destination_account_id: settings.conversion_owner_customer_id,
      action_id: settings.converted_lead_action_id,
      transaction_id: transactionId,
      processing_status: "queued",
      payload_snapshot: {
        event_type: GOOGLE_ADS_CONVERTED_LEAD_EVENT,
        occurred_at: event.occurred_at.toISOString(),
        conversion_value: event.conversion_value?.toString() ?? null,
        currency: event.currency,
        attribution_touchpoint_id: event.attribution_touchpoint_id,
      },
    },
  });

  return {
    event,
    outbox,
    deliveryState: "queued" as const,
  };
}

export function buildClosedWonTransactionId(dealId: string) {
  return saleTransactionId(dealId);
}
