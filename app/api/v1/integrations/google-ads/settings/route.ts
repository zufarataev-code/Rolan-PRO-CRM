import { NextRequest } from "next/server";

import {
  GoogleAdsSettingsValidationError,
  patchGoogleAdsSettings,
  readQualificationStageFromRules,
  type GoogleAdsSettingsPatch,
} from "@/features/google-ads/settings";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireRequestSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http/api-response";

const SETTINGS_KEY = "default";

async function owner(request: NextRequest) {
  return requireRequestSession(request, [ROLE_CODES.OWNER]);
}

export async function GET(request: NextRequest) {
  const auth = await owner(request);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Google Ads settings are owner-only.");
  }

  const settings = await prisma.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: SETTINGS_KEY },
  });

  const oauthConfigured = Boolean(
    process.env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN?.trim(),
  );
  const serviceAccountConfigured = Boolean(
    process.env.GOOGLE_ADS_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_ADS_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );

  return apiSuccess({
    configured: Boolean(settings),
    upload_enabled: settings?.upload_enabled ?? false,
    validate_only: settings?.validate_only ?? true,
    cloud_project_id: settings?.cloud_project_id ?? null,
    conversion_owner_customer_id: settings?.conversion_owner_customer_id ?? null,
    login_customer_id: settings?.login_customer_id ?? null,
    qualified_lead_action_id: settings?.qualified_lead_action_id ?? null,
    converted_lead_action_id: settings?.converted_lead_action_id ?? null,
    qualification_pipeline_status_code: readQualificationStageFromRules(settings?.qualification_rules),
    customer_match_enabled: settings?.customer_match_enabled ?? false,
    customer_match_user_list_id: settings?.customer_match_user_list_id ?? null,
    customer_match_terms_accepted: settings?.customer_match_terms_accepted ?? false,
    credentials: {
      cloud_managed_api_access: oauthConfigured || serviceAccountConfigured,
      oauth_refresh_token_configured: oauthConfigured,
      service_account_configured: serviceAccountConfigured,
      legacy_developer_token_configured: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim()),
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await owner(request);
  if (!auth.ok) {
    return apiError(auth.reason === "forbidden" ? 403 : 401, auth.reason, "Google Ads settings are owner-only.");
  }

  const body = (await request.json().catch(() => null)) as GoogleAdsSettingsPatch | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "invalid_body", "A JSON request body is required.");
  }

  try {
    const settings = await patchGoogleAdsSettings(body);
    return apiSuccess({
      upload_enabled: settings.upload_enabled,
      validate_only: settings.validate_only,
      cloud_project_id: settings.cloud_project_id,
      conversion_owner_customer_id: settings.conversion_owner_customer_id,
      login_customer_id: settings.login_customer_id,
      qualified_lead_action_id: settings.qualified_lead_action_id,
      converted_lead_action_id: settings.converted_lead_action_id,
      qualification_pipeline_status_code: readQualificationStageFromRules(settings.qualification_rules),
      customer_match_enabled: settings.customer_match_enabled,
      customer_match_user_list_id: settings.customer_match_user_list_id,
      customer_match_terms_accepted: settings.customer_match_terms_accepted,
    });
  } catch (cause) {
    if (cause instanceof GoogleAdsSettingsValidationError) {
      return apiError(400, cause.code, cause.message);
    }
    throw cause;
  }
}
