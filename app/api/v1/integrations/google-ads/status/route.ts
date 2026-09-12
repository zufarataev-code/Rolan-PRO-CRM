import { NextRequest } from "next/server";

import {
  GOOGLE_ADS_CONVERTED_LEAD_EVENT,
  GOOGLE_ADS_DEFAULT_SETTING_KEY,
  GOOGLE_ADS_QUALIFIED_LEAD_EVENT,
} from "@/features/google-ads/conversion-events";
import { readQualificationStageFromRules } from "@/features/google-ads/settings";
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

  const [
    settings,
    conversionStatusGroups,
    awaitingConvertedConfiguration,
    awaitingQualifiedConfiguration,
    oldestPending,
    recentProblems,
    adjustmentStatusGroups,
    customerMatchStatusGroups,
    customerMatchMembershipGroups,
    latestCost,
    costRowCount,
  ] = await Promise.all([
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
        qualification_rules: true,
        customer_match_enabled: true,
        customer_match_user_list_id: true,
        customer_match_terms_accepted: true,
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
    prisma.conversionEvent.count({
      where: {
        event_type: GOOGLE_ADS_QUALIFIED_LEAD_EVENT,
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
    prisma.conversionAdjustmentOutbox.groupBy({
      by: ["processing_status"],
      _count: { _all: true },
    }),
    prisma.customerMatchOutbox.groupBy({
      by: ["processing_status"],
      _count: { _all: true },
    }),
    prisma.customerMatchMembership.groupBy({
      by: ["desired_state", "applied_state"],
      _count: { _all: true },
    }),
    prisma.googleAdsDailyCost.findFirst({
      orderBy: [{ segments_date: "desc" }, { imported_at: "desc" }],
      select: {
        customer_id: true,
        segments_date: true,
        currency: true,
        imported_at: true,
      },
    }),
    prisma.googleAdsDailyCost.count(),
  ]);

  const conversionOutbox = Object.fromEntries(
    conversionStatusGroups.map((group) => [group.processing_status, group._count._all]),
  );
  const adjustmentOutbox = Object.fromEntries(
    adjustmentStatusGroups.map((group) => [group.processing_status, group._count._all]),
  );
  const customerMatchOutbox = Object.fromEntries(
    customerMatchStatusGroups.map((group) => [group.processing_status, group._count._all]),
  );
  const customerMatchMemberships = customerMatchMembershipGroups.map((group) => ({
    desired_state: group.desired_state,
    applied_state: group.applied_state,
    count: group._count._all,
  }));
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
          qualification_pipeline_status_code: readQualificationStageFromRules(settings.qualification_rules),
          sale_milestone: settings.sale_milestone,
          value_basis: settings.value_basis,
          rule_version: settings.rule_version,
        }
      : null,
    customer_match: {
      enabled: settings?.customer_match_enabled ?? false,
      user_list_id: settings?.customer_match_user_list_id ?? null,
      terms_accepted: settings?.customer_match_terms_accepted ?? false,
      outbox: customerMatchOutbox,
      memberships: customerMatchMemberships,
    },
    conversions: {
      outbox: conversionOutbox,
      awaiting_configuration: {
        converted_lead: awaitingConvertedConfiguration,
        qualified_lead: awaitingQualifiedConfiguration,
      },
      oldest_pending: oldestPending,
      recent_problems: recentProblems,
    },
    adjustments: {
      outbox: adjustmentOutbox,
    },
    cost_feed: {
      row_count: costRowCount,
      latest: latestCost,
    },
    credential_presence: {
      developer_token: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim()),
      oauth_refresh_token: Boolean(
        process.env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim() &&
          process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET?.trim() &&
          process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN?.trim(),
      ),
      service_account: Boolean(
        process.env.GOOGLE_ADS_SERVICE_ACCOUNT_EMAIL?.trim() &&
          process.env.GOOGLE_ADS_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
      ),
    },
    diagnostics_note:
      (settings?.validate_only ?? true)
        ? "Validate-only requests are validated but not processed; live activation requires a separate explicit owner workflow."
        : "Live uploads are enabled; submitted requests may remain processing in Google before final diagnostics are available.",
  });
}
