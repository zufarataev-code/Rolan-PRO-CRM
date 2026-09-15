import { Prisma } from "@prisma/client";

import { PIPELINE_STAGE_CODES } from "@/features/sales/pipeline";
import { prisma } from "@/lib/db";

import { GOOGLE_ADS_DEFAULT_SETTING_KEY } from "./conversion-events";

const PIPELINE_STAGE_SET = new Set<string>(PIPELINE_STAGE_CODES);

export class GoogleAdsSettingsValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAdsSettingsValidationError";
  }
}

function fail(code: string, message: string): never {
  throw new GoogleAdsSettingsValidationError(code, message);
}

function optionalNumericId(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") fail("invalid_google_id", `${field} must be a string or null.`);
  const normalized = value.replace(/[\s-]/g, "");
  if (!/^\d{1,64}$/.test(normalized)) fail("invalid_google_id", `${field} must contain only a numeric Google ID.`);
  return normalized;
}

function optionalCloudProjectId(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") fail("invalid_cloud_project_id", "cloud_project_id must be a string or null.");
  const normalized = value.trim();
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(normalized)) {
    fail("invalid_cloud_project_id", "cloud_project_id is not a valid Google Cloud project identifier.");
  }
  return normalized;
}

export function normalizeQualificationPipelineStatus(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") fail("invalid_qualification_stage", "qualification_pipeline_status_code must be a string or null.");
  const normalized = value.trim().toUpperCase();
  if (!PIPELINE_STAGE_SET.has(normalized)) {
    fail("invalid_qualification_stage", "qualification_pipeline_status_code is not a known CRM pipeline stage.");
  }
  return normalized;
}

export type GoogleAdsSettingsPatch = {
  conversion_owner_customer_id?: unknown;
  login_customer_id?: unknown;
  qualified_lead_action_id?: unknown;
  converted_lead_action_id?: unknown;
  customer_match_user_list_id?: unknown;
  cloud_project_id?: unknown;
  qualification_pipeline_status_code?: unknown;
  customer_match_enabled?: unknown;
  customer_match_terms_accepted?: unknown;
  upload_enabled?: unknown;
  validate_only?: unknown;
};

function optionalBoolean(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") fail("invalid_boolean", `${field} must be boolean.`);
  return value;
}

export async function patchGoogleAdsSettings(input: GoogleAdsSettingsPatch) {
  const conversionOwnerCustomerId = optionalNumericId(input.conversion_owner_customer_id, "conversion_owner_customer_id");
  const loginCustomerId = optionalNumericId(input.login_customer_id, "login_customer_id");
  const qualifiedLeadActionId = optionalNumericId(input.qualified_lead_action_id, "qualified_lead_action_id");
  const convertedLeadActionId = optionalNumericId(input.converted_lead_action_id, "converted_lead_action_id");
  const customerMatchUserListId = optionalNumericId(input.customer_match_user_list_id, "customer_match_user_list_id");
  const cloudProjectId = optionalCloudProjectId(input.cloud_project_id);
  const qualificationStage = normalizeQualificationPipelineStatus(input.qualification_pipeline_status_code);
  const customerMatchEnabled = optionalBoolean(input.customer_match_enabled, "customer_match_enabled");
  const customerMatchTermsAccepted = optionalBoolean(
    input.customer_match_terms_accepted,
    "customer_match_terms_accepted",
  );
  const uploadEnabled = optionalBoolean(input.upload_enabled, "upload_enabled");
  const validateOnly = optionalBoolean(input.validate_only, "validate_only");

  if (validateOnly === false) {
    fail(
      "live_activation_requires_separate_action",
      "validate_only cannot be disabled through settings; use the controlled live-activation workflow after validation.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.googleAdsIntegrationSetting.findUnique({
      where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    });

    const nextTermsAccepted = customerMatchTermsAccepted ?? current?.customer_match_terms_accepted ?? false;
    const nextCustomerMatchEnabled = customerMatchEnabled ?? current?.customer_match_enabled ?? false;
    if (nextCustomerMatchEnabled && !nextTermsAccepted) {
      fail(
        "customer_match_terms_required",
        "Customer Match cannot be enabled until the owner explicitly confirms the Customer Match Terms of Service.",
      );
    }

    const data: Prisma.GoogleAdsIntegrationSettingUncheckedCreateInput = {
      setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY,
      upload_enabled: uploadEnabled ?? current?.upload_enabled ?? false,
      validate_only: validateOnly ?? current?.validate_only ?? true,
      cloud_project_id: cloudProjectId !== undefined ? cloudProjectId : current?.cloud_project_id ?? null,
      conversion_owner_customer_id:
        conversionOwnerCustomerId !== undefined
          ? conversionOwnerCustomerId
          : current?.conversion_owner_customer_id ?? null,
      login_customer_id: loginCustomerId !== undefined ? loginCustomerId : current?.login_customer_id ?? null,
      qualified_lead_action_id:
        qualifiedLeadActionId !== undefined ? qualifiedLeadActionId : current?.qualified_lead_action_id ?? null,
      converted_lead_action_id:
        convertedLeadActionId !== undefined ? convertedLeadActionId : current?.converted_lead_action_id ?? null,
      qualification_rules:
        qualificationStage !== undefined
          ? qualificationStage
            ? ({ pipeline_status_code: qualificationStage } as Prisma.InputJsonValue)
            : Prisma.JsonNull
          : current?.qualification_rules ?? Prisma.JsonNull,
      sale_milestone: current?.sale_milestone ?? "CLOSED_WON",
      value_basis: current?.value_basis ?? "ACTUAL_SALE_REVENUE",
      conversion_unit: current?.conversion_unit ?? "DEAL",
      currency_policy: current?.currency_policy ?? "DEAL_CURRENCY",
      attribution_policy: current?.attribution_policy ?? "DEAL_SELECTED_TOUCHPOINT",
      reopened_deal_policy: current?.reopened_deal_policy ?? "SAME_TRANSACTION",
      bidding_goal: current?.bidding_goal ?? null,
      audience_rules: current?.audience_rules ?? Prisma.JsonNull,
      rule_version: current?.rule_version ?? "v1",
      customer_match_enabled: nextCustomerMatchEnabled,
      customer_match_user_list_id:
        customerMatchUserListId !== undefined
          ? customerMatchUserListId
          : current?.customer_match_user_list_id ?? null,
      customer_match_terms_accepted: nextTermsAccepted,
    };

    return tx.googleAdsIntegrationSetting.upsert({
      where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
      create: data,
      update: data,
    });
  });
}

export function readQualificationStageFromRules(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, Prisma.JsonValue>).pipeline_status_code;
  return typeof candidate === "string" ? candidate : null;
}
