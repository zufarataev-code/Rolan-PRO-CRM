import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { GOOGLE_ADS_DEFAULT_SETTING_KEY } from "./conversion-events";
import { getGoogleAccessToken } from "./oauth";

const GOOGLE_ADS_API_VERSION = "v25";
const STALE_SUBMISSION_MS = 10 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

export type AdjustmentUploadInput = {
  customerId: string;
  actionId: string;
  originalTransactionId: string;
  adjustmentType: "RETRACTION" | "RESTATEMENT";
  adjustmentDateTime: Date;
  adjustedValue?: string | Prisma.Decimal | null;
  currency?: string | null;
  validateOnly: boolean;
};

type GoogleAdsAdjustmentResponse = {
  partialFailureError?: unknown;
  results?: unknown[];
  jobId?: string;
};

function envFlag(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeNumericGoogleId(value: string) {
  return value.replace(/[\s-]/g, "");
}

export function formatGoogleAdsAdjustmentDateTime(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Invalid Google Ads adjustment date/time.");
  }
  return `${value.toISOString().slice(0, 19).replace("T", " ")}+00:00`;
}

export function buildGoogleAdsAdjustmentRequest(input: AdjustmentUploadInput) {
  const customerId = normalizeNumericGoogleId(input.customerId);
  const actionId = normalizeNumericGoogleId(input.actionId);
  if (!/^\d+$/.test(customerId) || !/^\d+$/.test(actionId)) {
    throw new Error("Google Ads customer/action IDs must be numeric.");
  }

  const adjustment: Record<string, unknown> = {
    conversionAction: `customers/${customerId}/conversionActions/${actionId}`,
    adjustmentType: input.adjustmentType,
    orderId: input.originalTransactionId,
    adjustmentDateTime: formatGoogleAdsAdjustmentDateTime(input.adjustmentDateTime),
  };

  if (input.adjustmentType === "RESTATEMENT") {
    if (input.adjustedValue == null || !input.currency?.trim()) {
      throw new Error("RESTATEMENT requires adjusted value and currency.");
    }
    const adjustedValue = Number(input.adjustedValue.toString());
    if (!Number.isFinite(adjustedValue) || adjustedValue < 0) {
      throw new Error("RESTATEMENT adjusted value must be a non-negative decimal.");
    }
    adjustment.restatementValue = {
      adjustedValue,
      currencyCode: input.currency.trim().toUpperCase(),
    };
  }

  return {
    conversionAdjustments: [adjustment],
    partialFailure: true,
    validateOnly: input.validateOnly,
  };
}

export function isRetryableAdjustmentStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export function adjustmentRetryDelayMs(attempts: number, random = Math.random()) {
  const exponent = Math.max(0, Math.min(8, attempts - 1));
  const base = Math.min(MAX_RETRY_DELAY_MS, 30_000 * 2 ** exponent);
  const jitter = Math.floor(base * 0.25 * Math.max(0, Math.min(1, random)));
  return Math.min(MAX_RETRY_DELAY_MS, base + jitter);
}

export function hasGoogleAdsPartialFailure(body: unknown) {
  if (!body || typeof body !== "object") return false;
  return Boolean((body as Record<string, unknown>).partialFailureError);
}

function compactGoogleAdsError(body: unknown, status: number) {
  if (!body || typeof body !== "object") {
    return { status, message: "Google Ads conversion adjustment request failed." };
  }
  const record = body as Record<string, unknown>;
  const error = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : null;
  return {
    status,
    code: typeof error?.code === "number" || typeof error?.code === "string" ? error.code : undefined,
    google_status: typeof error?.status === "string" ? error.status : undefined,
    message:
      typeof error?.message === "string"
        ? error.message.slice(0, 1000)
        : "Google Ads conversion adjustment request failed.",
  };
}

function compactPartialFailure(body: GoogleAdsAdjustmentResponse) {
  const partial = body.partialFailureError;
  if (!partial || typeof partial !== "object") {
    return { code: "partial_failure", message: "Google Ads rejected the conversion adjustment." };
  }
  const record = partial as Record<string, unknown>;
  return {
    code: "partial_failure",
    google_code: typeof record.code === "number" || typeof record.code === "string" ? record.code : undefined,
    message:
      typeof record.message === "string"
        ? record.message.slice(0, 1000)
        : "Google Ads rejected the conversion adjustment.",
  };
}

async function claimNextAdjustmentOutbox() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_SUBMISSION_MS);
  const claimableWhere = {
    OR: [
      {
        processing_status: { in: ["queued", "retry"] },
        next_retry_at: { lte: now },
      },
      {
        processing_status: "submitting",
        updated_at: { lte: staleBefore },
      },
    ],
  } satisfies Prisma.ConversionAdjustmentOutboxWhereInput;

  const candidates = await prisma.conversionAdjustmentOutbox.findMany({
    where: claimableWhere,
    orderBy: [{ next_retry_at: "asc" }, { created_at: "asc" }],
    take: 5,
    select: { conversion_adjustment_outbox_id: true },
  });

  for (const candidate of candidates) {
    const claimed = await prisma.conversionAdjustmentOutbox.updateMany({
      where: {
        conversion_adjustment_outbox_id: candidate.conversion_adjustment_outbox_id,
        ...claimableWhere,
      },
      data: {
        processing_status: "submitting",
        attempts: { increment: 1 },
        last_error: Prisma.JsonNull,
      },
    });
    if (claimed.count !== 1) continue;

    return prisma.conversionAdjustmentOutbox.findUnique({
      where: { conversion_adjustment_outbox_id: candidate.conversion_adjustment_outbox_id },
      include: { conversion_adjustment: true },
    });
  }

  return null;
}

export async function processNextConversionAdjustmentUpload() {
  const settings = await prisma.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    select: {
      upload_enabled: true,
      validate_only: true,
      login_customer_id: true,
    },
  });

  const uploadEnabled = settings?.upload_enabled === true || envFlag("GOOGLE_ADS_UPLOAD_ENABLED", false);
  if (!uploadEnabled) return { status: "disabled" as const };

  // Live execution requires BOTH database and environment validation switches to be false.
  const validateOnly = (settings?.validate_only ?? true) || envFlag("GOOGLE_ADS_VALIDATE_ONLY", true);
  const job = await claimNextAdjustmentOutbox();
  if (!job) return { status: "idle" as const };

  const adjustment = job.conversion_adjustment;
  let requestBody: ReturnType<typeof buildGoogleAdsAdjustmentRequest>;
  try {
    requestBody = buildGoogleAdsAdjustmentRequest({
      customerId: job.destination_account_id,
      actionId: job.action_id,
      originalTransactionId: job.original_transaction_id,
      adjustmentType: adjustment.adjustment_type as "RETRACTION" | "RESTATEMENT",
      adjustmentDateTime: adjustment.occurred_at,
      adjustedValue: adjustment.adjusted_value,
      currency: adjustment.currency,
      validateOnly,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid conversion adjustment payload.";
    await prisma.conversionAdjustmentOutbox.update({
      where: { conversion_adjustment_outbox_id: job.conversion_adjustment_outbox_id },
      data: {
        processing_status: "needs_operator_action",
        last_error: { code: "invalid_adjustment_payload", message: message.slice(0, 1000) },
      },
    });
    return { status: "needs_operator_action" as const, outboxId: job.conversion_adjustment_outbox_id };
  }

  const customerId = normalizeNumericGoogleId(job.destination_account_id);
  const endpoint = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadConversionAdjustments`;

  try {
    const accessToken = await getGoogleAccessToken(["https://www.googleapis.com/auth/adwords"]);
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    };
    // Developer tokens were sunset on 2026-09-09. Older deployments may still
    // provide one; Google currently accepts and ignores the header, so sending it
    // remains harmless during migration but it is no longer a runtime requirement.
    const legacyDeveloperToken = trimOrNull(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
    if (legacyDeveloperToken) headers["developer-token"] = legacyDeveloperToken;
    const loginCustomerId = trimOrNull(settings?.login_customer_id ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
    if (loginCustomerId) headers["login-customer-id"] = normalizeNumericGoogleId(loginCustomerId);

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
    const responseBody = (await response.json().catch(() => null)) as GoogleAdsAdjustmentResponse | null;
    const requestId = response.headers.get("request-id");

    if (response.ok && responseBody && hasGoogleAdsPartialFailure(responseBody)) {
      await prisma.conversionAdjustmentOutbox.update({
        where: { conversion_adjustment_outbox_id: job.conversion_adjustment_outbox_id },
        data: {
          processing_status: "needs_operator_action",
          request_id: requestId,
          last_error: compactPartialFailure(responseBody),
        },
      });
      return {
        status: "needs_operator_action" as const,
        outboxId: job.conversion_adjustment_outbox_id,
        requestId,
      };
    }

    if (response.ok) {
      await prisma.conversionAdjustmentOutbox.update({
        where: { conversion_adjustment_outbox_id: job.conversion_adjustment_outbox_id },
        data: {
          processing_status: validateOnly ? "validated" : "submitted",
          submitted_at: new Date(),
          request_id: requestId,
          last_error: Prisma.JsonNull,
        },
      });
      return {
        status: validateOnly ? ("validated" as const) : ("submitted" as const),
        outboxId: job.conversion_adjustment_outbox_id,
        requestId,
      };
    }

    const retryable = isRetryableAdjustmentStatus(response.status);
    await prisma.conversionAdjustmentOutbox.update({
      where: { conversion_adjustment_outbox_id: job.conversion_adjustment_outbox_id },
      data: {
        processing_status: retryable ? "retry" : "needs_operator_action",
        next_retry_at: retryable
          ? new Date(Date.now() + adjustmentRetryDelayMs(job.attempts))
          : job.next_retry_at,
        request_id: requestId,
        last_error: compactGoogleAdsError(responseBody, response.status),
      },
    });
    return {
      status: retryable ? ("retry" as const) : ("needs_operator_action" as const),
      outboxId: job.conversion_adjustment_outbox_id,
      httpStatus: response.status,
      requestId,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown Google Ads transport error.";
    const permanentCredentialFailure =
      message.includes("credentials are not configured") || /OAuth token request failed \((400|401|403)\)/.test(message);

    await prisma.conversionAdjustmentOutbox.update({
      where: { conversion_adjustment_outbox_id: job.conversion_adjustment_outbox_id },
      data: {
        processing_status: permanentCredentialFailure ? "needs_operator_action" : "retry",
        next_retry_at: permanentCredentialFailure
          ? job.next_retry_at
          : new Date(Date.now() + adjustmentRetryDelayMs(job.attempts)),
        last_error: {
          code: permanentCredentialFailure ? "google_credentials" : "transport_error",
          message: message.slice(0, 1000),
        },
      },
    });
    return {
      status: permanentCredentialFailure ? ("needs_operator_action" as const) : ("retry" as const),
      outboxId: job.conversion_adjustment_outbox_id,
    };
  }
}
