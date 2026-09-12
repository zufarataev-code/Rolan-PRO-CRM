import { NextRequest } from "next/server";

import {
  GOOGLE_ADS_CONVERTED_LEAD_EVENT,
  GOOGLE_ADS_DEFAULT_SETTING_KEY,
} from "@/features/google-ads/conversion-events";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const auth = await requireRequestSession(request, [ROLE_CODES.OWNER]);
  if (!auth.ok) {
    return apiError(
      auth.reason === "forbidden" ? 403 : 401,
      auth.reason,
      "Google Ads integration diagnostics are owner-only.",
    );
  }

  const [settings, statusGroups, awaitingConfiguration, oldestPending, recentProblems] = await Promise.all([
    prisma.googleAdsIntegrationSetting.findUnique({
      where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
      select: {
        upload_enabled: true,
        validate_only: true,
        cloud_project_id: true,
        conversion_owner_customer_id: true,
        login_customer_id: true,
        qualified_lead_action_id: true,
        converted_lead_action_id: true,
        sale_milestone: true,
        value_basis: true,
        rule_version: true,
        updated_at: true,
      },
    }),
    prisma.conversionUploadOutbox.groupBy({
      by: ["processing_status"],
      _count: { _all: true },
    }),
    prisma.conversionEvent.count({
      where: {
        event_type: GOOGLE_ADS_CONVERTED_LEAD_EVENT,
        upload_outboxes: { none: {} },
      },
    }),
    prisma.conversionUploadOutbox.findFirst({
      where: { processing_status: { in: ["queued", "retry", "submitting"] } },
      orderBy: [{ next_retry_at: "asc" }, { created_at: "asc" }],
      select: {
        conversion_upload_outbox_id: true,
        processing_status: true,
        attempts: true,
        next_retry_at: true,
        created_at: true,
      },
    }),
    prisma.conversionUploadOutbox.findMany({
      where: { processing_status: { in: ["retry", "needs_operator_action", "suppressed"] } },
      orderBy: { updated_at: "desc" },
      take: 20,
      select: {
        conversion_upload_outbox_id: true,
        transaction_id: true,
        processing_status: true,
        attempts: true,
        next_retry_at: true,
        submitted_at: true,
        request_id: true,
        field_warnings: true,
        last_error: true,
        updated_at: true,
      },
    }),
  ]);

  const outbox = Object.fromEntries(
    statusGroups.map((group) => [group.processing_status, group._count._all]),
  );
  const destinationConfigured = Boolean(
    settings?.conversion_owner_customer_id && settings.converted_lead_action_id,
  );

  return apiSuccess({
    configured: Boolean(settings),
    destination_configured: destinationConfigured,
    upload_enabled: settings?.upload_enabled ?? false,
    validate_only: settings?.validate_only ?? true,
    identifiers: settings
      ? {
          cloud_project_id: settings.cloud_project_id,
          conversion_owner_customer_id: settings.conversion_owner_customer_id,
          login_customer_id: settings.login_customer_id,
          qualified_lead_action_id: settings.qualified_lead_action_id,
          converted_lead_action_id: settings.converted_lead_action_id,
        }
      : null,
    business_rules: settings
      ? {
          sale_milestone: settings.sale_milestone,
          value_basis: settings.value_basis,
          rule_version: settings.rule_version,
        }
      : null,
    outbox,
    awaiting_configuration: awaitingConfiguration,
    oldest_pending: oldestPending,
    recent_problems: recentProblems,
    diagnostics_note:
      (settings?.validate_only ?? true)
        ? "Validate-only requests are validated but not processed; Google ingestion diagnostics are intentionally not queried."
        : "Submitted requests may remain processing in Google before final diagnostics are available.",
  });
}
