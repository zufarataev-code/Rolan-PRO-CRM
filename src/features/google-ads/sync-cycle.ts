import { reconcileLegacyGoogleAdsOutcomes } from "./legacy-outcomes";
import { prisma } from "@/lib/db";

import { processNextConversionAdjustmentUpload } from "./conversion-adjustment-uploader";
import { GOOGLE_ADS_DEFAULT_SETTING_KEY } from "./conversion-events";
import { hasAnyGoogleCredentials } from "./credentials";
import { processNextConversionUpload } from "./data-manager";
import { processNextCustomerMatchUpload } from "./customer-match-uploader";
import { reconcileConversionOutbox } from "./reconciliation";
import { reconcileNextConversionRequestStatus } from "./request-status";

/**
 * One delivery pass (spec §6): reconcile events into the outbox, upload queued
 * conversions, poll request diagnostics, upload adjustments and Customer Match.
 * Runs every 10 minutes on the server and on «Отправить сейчас». Google outages
 * never block CRM work: each worker keeps its own retry state.
 */
let running = false;

export async function runGoogleAdsSyncCycle({ limit = 25 } = {}) {
  if (running) return { skipped: "already_running" as const };
  running = true;
  try {
    const legacy = await reconcileLegacyGoogleAdsOutcomes().catch(() => {
      console.error("[google-ads] legacy reconciliation unavailable");
      return { recorded: 0, failed: 1 };
    });
    const settings = await prisma.googleAdsIntegrationSetting.findUnique({
      where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
      select: { upload_enabled: true, conversion_owner_customer_id: true },
    });
    if (!settings?.upload_enabled || !settings.conversion_owner_customer_id) return { skipped: "not_enabled" as const };
    if (!(await hasAnyGoogleCredentials())) return { skipped: "no_credentials" as const };

    const reconciliation = await reconcileConversionOutbox(100);
    const count = { uploads: 0, statuses: 0, adjustments: 0, audience: 0 };
    for (let i = 0; i < limit; i += 1) {
      const result = await processNextConversionUpload();
      if (result.status === "idle" || result.status === "disabled") break;
      count.uploads += 1;
    }
    for (let i = 0; i < limit; i += 1) {
      const result = await reconcileNextConversionRequestStatus();
      if (result.status === "idle") break;
      count.statuses += 1;
    }
    for (let i = 0; i < limit; i += 1) {
      const result = await processNextConversionAdjustmentUpload();
      if (result.status === "idle" || result.status === "disabled") break;
      count.adjustments += 1;
    }
    for (let i = 0; i < limit; i += 1) {
      const result = (await processNextCustomerMatchUpload()) as { status?: string };
      if (!result || result.status === "idle" || result.status === "disabled") break;
      count.audience += 1;
    }
    return { skipped: null, reconciliation, legacy, ...count };
  } finally {
    running = false;
  }
}

const TEN_MINUTES = 10 * 60 * 1000;

/** Started once per server process from instrumentation.ts. */
export function startGoogleAdsSyncScheduler() {
  const globalKey = "__rolanproGoogleAdsSync";
  const holder = globalThis as unknown as Record<string, unknown>;
  if (holder[globalKey] || process.env.GOOGLE_ADS_AUTO_SYNC === "off") return;
  holder[globalKey] = setInterval(() => {
    runGoogleAdsSyncCycle().catch((error) => console.error("[google-ads] sync cycle failed", error instanceof Error ? error.message : error));
  }, TEN_MINUTES);
}
