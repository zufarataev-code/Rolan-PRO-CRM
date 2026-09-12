import { prisma } from "@/lib/db";

import {
  GOOGLE_ADS_CONVERTED_LEAD_EVENT,
  GOOGLE_ADS_DEFAULT_SETTING_KEY,
} from "./conversion-events";

const MAX_RECONCILE_BATCH = 100;

export async function reconcileConvertedLeadOutbox(limit = MAX_RECONCILE_BATCH) {
  const settings = await prisma.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    select: {
      conversion_owner_customer_id: true,
      converted_lead_action_id: true,
    },
  });

  if (!settings?.conversion_owner_customer_id || !settings.converted_lead_action_id) {
    return {
      status: "awaiting_configuration" as const,
      scanned: 0,
      created: 0,
    };
  }

  const boundedLimit = Math.max(1, Math.min(MAX_RECONCILE_BATCH, Math.trunc(limit)));
  const events = await prisma.conversionEvent.findMany({
    where: {
      event_type: GOOGLE_ADS_CONVERTED_LEAD_EVENT,
      upload_outboxes: {
        none: {},
      },
    },
    orderBy: [{ occurred_at: "asc" }, { created_at: "asc" }],
    take: boundedLimit,
    select: {
      conversion_event_id: true,
      transaction_id: true,
      event_type: true,
      occurred_at: true,
      conversion_value: true,
      currency: true,
      attribution_touchpoint_id: true,
    },
  });

  let created = 0;
  for (const event of events) {
    const outbox = await prisma.conversionUploadOutbox.upsert({
      where: {
        destination_account_id_action_id_transaction_id: {
          destination_account_id: settings.conversion_owner_customer_id,
          action_id: settings.converted_lead_action_id,
          transaction_id: event.transaction_id,
        },
      },
      update: {},
      create: {
        conversion_event_id: event.conversion_event_id,
        destination_account_id: settings.conversion_owner_customer_id,
        action_id: settings.converted_lead_action_id,
        transaction_id: event.transaction_id,
        processing_status: "queued",
        payload_snapshot: {
          event_type: event.event_type,
          occurred_at: event.occurred_at.toISOString(),
          conversion_value: event.conversion_value?.toString() ?? null,
          currency: event.currency,
          attribution_touchpoint_id: event.attribution_touchpoint_id,
          reconciled_after_configuration: true,
        },
      },
      select: { conversion_upload_outbox_id: true },
    });

    if (outbox.conversion_upload_outbox_id) created += 1;
  }

  return {
    status: events.length === boundedLimit ? ("more_available" as const) : ("complete" as const),
    scanned: events.length,
    created,
  };
}
