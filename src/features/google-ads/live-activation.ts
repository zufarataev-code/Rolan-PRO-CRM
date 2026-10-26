import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { GOOGLE_ADS_DEFAULT_SETTING_KEY } from "./conversion-events";

export const GOOGLE_ADS_LIVE_CONFIRMATION = "ENABLE_LIVE_GOOGLE_ADS_UPLOADS";

export class GoogleAdsLiveActivationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAdsLiveActivationError";
  }
}

function fail(code: string, message: string): never {
  throw new GoogleAdsLiveActivationError(code, message);
}

function normalizeGoogleId(value: string) {
  return value.replace(/[\s-]/g, "");
}

async function hasGoogleCredentials() {
  const { hasAnyGoogleCredentials } = await import("./credentials");
  return hasAnyGoogleCredentials();
}

export type ActivateGoogleAdsLiveInput = {
  confirmation: string;
  customerId: string;
};

/**
 * The only application path that can set validate_only=false.
 * It intentionally requires an environment-level opt-in in addition to owner confirmation.
 * Google Ads API access is determined by the Google Cloud project that owns the OAuth
 * client/service account. Legacy developer tokens are optional and are not required here.
 */
export async function activateGoogleAdsLiveUploads(input: ActivateGoogleAdsLiveInput) {
  if (input.confirmation !== GOOGLE_ADS_LIVE_CONFIRMATION) {
    fail("live_confirmation_required", `confirmation must equal ${GOOGLE_ADS_LIVE_CONFIRMATION}.`);
  }
  // The server can still force test mode (GOOGLE_ADS_VALIDATE_ONLY=true); otherwise
  // the owner's typed confirmation with the customer ID is the live switch.
  if (process.env.GOOGLE_ADS_VALIDATE_ONLY?.trim().toLowerCase() === "true") {
    fail(
      "environment_live_gate_closed",
      "The server forces test mode (GOOGLE_ADS_VALIDATE_ONLY=true).",
    );
  }
  if (!(await hasGoogleCredentials())) {
    fail("google_credentials_incomplete", "Google Ads OAuth credentials must be configured first.");
  }

  return prisma.$transaction(async (tx) => {
    const settings = await tx.googleAdsIntegrationSetting.findUnique({
      where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    });
    if (!settings?.conversion_owner_customer_id || !settings.converted_lead_action_id) {
      fail(
        "conversion_destination_incomplete",
        "Google Ads customer ID and converted-lead conversion action ID must be configured before live activation.",
      );
    }

    const expectedCustomerId = normalizeGoogleId(settings.conversion_owner_customer_id);
    if (normalizeGoogleId(input.customerId) !== expectedCustomerId) {
      fail("customer_id_confirmation_mismatch", "Confirmed Google Ads customer ID does not match CRM settings.");
    }

    await tx.googleAdsIntegrationSetting.update({
      where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
      data: {
        upload_enabled: true,
        validate_only: false,
      },
    });

    const now = new Date();
    const [conversions, adjustments, customerMatch] = await Promise.all([
      tx.conversionUploadOutbox.updateMany({
        where: { processing_status: "validated" },
        data: {
          processing_status: "queued",
          next_retry_at: now,
          last_error: Prisma.JsonNull,
        },
      }),
      tx.conversionAdjustmentOutbox.updateMany({
        where: { processing_status: "validated" },
        data: {
          processing_status: "queued",
          next_retry_at: now,
          last_error: Prisma.JsonNull,
        },
      }),
      tx.customerMatchOutbox.updateMany({
        where: { processing_status: "validated" },
        data: {
          processing_status: "queued",
          next_retry_at: now,
          last_error: Prisma.JsonNull,
        },
      }),
    ]);

    return {
      customerId: expectedCustomerId,
      validateOnly: false as const,
      uploadEnabled: true as const,
      requeued: {
        conversions: conversions.count,
        adjustments: adjustments.count,
        customer_match: customerMatch.count,
      },
    };
  });
}
