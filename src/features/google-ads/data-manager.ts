import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { GOOGLE_ADS_DEFAULT_SETTING_KEY } from "./conversion-events";
import { buildHashedUserIdentifiers } from "./normalization";
import { getGoogleAccessToken } from "./oauth";

const DATA_MANAGER_EVENTS_ENDPOINT = "https://datamanager.googleapis.com/v1/events:ingest";
const STALE_SUBMISSION_MS = 10 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
const EVENT_SOURCES = new Set(["WEB", "APP", "IN_STORE", "PHONE", "MESSAGE", "OTHER"]);

type ConsentStatus = "CONSENT_GRANTED" | "CONSENT_DENIED" | "CONSENT_STATUS_UNSPECIFIED";

type DataManagerRequestInput = {
  operatingAccountId: string;
  loginAccountId?: string | null;
  actionId: string;
  validateOnly: boolean;
  transactionId: string;
  eventTimestamp: string;
  eventSource: string;
  conversionValue?: number | null;
  currency?: string | null;
  adIdentifiers?: {
    gclid?: string | null;
    gbraid?: string | null;
    wbraid?: string | null;
    sessionAttributes?: string | null;
  } | null;
  userIdentifiers?: Array<{ emailAddress?: string; phoneNumber?: string }>;
  consent?: {
    adUserData: ConsentStatus;
    adPersonalization: ConsentStatus;
  } | null;
};

type DataManagerSuccess = {
  requestId?: string;
  fieldWarnings?: unknown[];
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

export function toGoogleConsentStatus(value: string | null | undefined): ConsentStatus {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "GRANTED") return "CONSENT_GRANTED";
  if (normalized === "DENIED") return "CONSENT_DENIED";
  return "CONSENT_STATUS_UNSPECIFIED";
}

function normalizeEventSource(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return EVENT_SOURCES.has(normalized) ? normalized : "OTHER";
}

function dedupeIdentifiers(identifiers: Array<{ emailAddress?: string; phoneNumber?: string }>) {
  const seen = new Set<string>();
  return identifiers.filter((identifier) => {
    const key = identifier.emailAddress ? `email:${identifier.emailAddress}` : `phone:${identifier.phoneNumber ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readGoogleSessionAttributes(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Prisma.JsonValue>;
  const candidate = record.googleSessionAttributes ?? record.sessionAttributes;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

export function buildDataManagerEventsRequest(input: DataManagerRequestInput) {
  const destination: Record<string, unknown> = {
    operatingAccount: {
      accountType: "GOOGLE_ADS",
      accountId: input.operatingAccountId,
    },
    productDestinationId: input.actionId,
  };

  if (input.loginAccountId) {
    destination.loginAccount = {
      accountType: "GOOGLE_ADS",
      accountId: input.loginAccountId,
    };
  }

  const adIdentifiers = input.adIdentifiers
    ? Object.fromEntries(
        Object.entries(input.adIdentifiers).filter(([, value]) => typeof value === "string" && value.trim().length > 0),
      )
    : {};

  const event: Record<string, unknown> = {
    transactionId: input.transactionId,
    eventTimestamp: input.eventTimestamp,
    eventSource: normalizeEventSource(input.eventSource),
  };

  if (Object.keys(adIdentifiers).length > 0) event.adIdentifiers = adIdentifiers;
  if (input.userIdentifiers?.length) event.userData = { userIdentifiers: input.userIdentifiers };
  if (input.consent) event.consent = input.consent;
  if (input.conversionValue != null && Number.isFinite(input.conversionValue)) {
    event.conversionValue = input.conversionValue;
  }
  if (input.currency?.trim()) event.currency = input.currency.trim().toUpperCase().slice(0, 3);

  return {
    destinations: [destination],
    encoding: "HEX",
    validateOnly: input.validateOnly,
    events: [event],
  };
}

export function isRetryableDataManagerStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export function retryDelayMs(attempts: number, random = Math.random()) {
  const exponent = Math.max(0, Math.min(8, attempts - 1));
  const base = Math.min(MAX_RETRY_DELAY_MS, 30_000 * 2 ** exponent);
  const jitter = Math.floor(base * 0.25 * Math.max(0, Math.min(1, random)));
  return Math.min(MAX_RETRY_DELAY_MS, base + jitter);
}

function compactGoogleError(body: unknown, status: number) {
  if (!body || typeof body !== "object") return { status, message: "Google Data Manager request failed." };
  const record = body as Record<string, unknown>;
  const error = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : null;
  return {
    status,
    code: typeof error?.code === "number" || typeof error?.code === "string" ? error.code : undefined,
    google_status: typeof error?.status === "string" ? error.status : undefined,
    message: typeof error?.message === "string" ? error.message : "Google Data Manager request failed.",
  };
}

async function loadLatestConsent(leadId: string | null, clientId: string | null) {
  const filters: Array<Record<string, string>> = [];
  if (leadId) filters.push({ lead_id: leadId });
  if (clientId) filters.push({ client_id: clientId });
  if (!filters.length) return null;

  return prisma.consentSnapshot.findFirst({
    where: { OR: filters },
    orderBy: [{ effective_at: "desc" }, { created_at: "desc" }],
    select: {
      ad_user_data: true,
      ad_personalization: true,
      effective_at: true,
    },
  });
}

async function claimNextOutbox() {
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
  } satisfies Prisma.ConversionUploadOutboxWhereInput;

  const candidates = await prisma.conversionUploadOutbox.findMany({
    where: claimableWhere,
    orderBy: [{ next_retry_at: "asc" }, { created_at: "asc" }],
    take: 5,
    select: { conversion_upload_outbox_id: true },
  });

  for (const candidate of candidates) {
    const claimed = await prisma.conversionUploadOutbox.updateMany({
      where: {
        conversion_upload_outbox_id: candidate.conversion_upload_outbox_id,
        ...claimableWhere,
      },
      data: {
        processing_status: "submitting",
        attempts: { increment: 1 },
        last_error: Prisma.JsonNull,
      },
    });

    if (claimed.count !== 1) continue;

    return prisma.conversionUploadOutbox.findUnique({
      where: { conversion_upload_outbox_id: candidate.conversion_upload_outbox_id },
      include: {
        conversion_event: {
          include: {
            lead: { select: { email: true, phone: true } },
            client: { select: { email: true, phone: true } },
            attribution_touchpoint: true,
          },
        },
      },
    });
  }

  return null;
}

export async function processNextConversionUpload() {
  const settings = await prisma.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    select: {
      upload_enabled: true,
      validate_only: true,
      cloud_project_id: true,
      login_customer_id: true,
    },
  });

  const uploadEnabled = settings?.upload_enabled === true || envFlag("GOOGLE_ADS_UPLOAD_ENABLED", false);
  if (!uploadEnabled) {
    return { status: "disabled" as const };
  }

  // Live traffic requires two explicit switches: database validate_only=false
  // and GOOGLE_ADS_VALIDATE_ONLY=false. Missing configuration remains validation-only.
  const validateOnly = (settings?.validate_only ?? true) || envFlag("GOOGLE_ADS_VALIDATE_ONLY", true);
  const job = await claimNextOutbox();
  if (!job) return { status: "idle" as const };

  const event = job.conversion_event;
  const touchpoint = event.attribution_touchpoint;
  const consentSnapshot = await loadLatestConsent(event.lead_id, event.client_id);
  const consent = consentSnapshot
    ? {
        adUserData: toGoogleConsentStatus(consentSnapshot.ad_user_data),
        adPersonalization: toGoogleConsentStatus(consentSnapshot.ad_personalization),
      }
    : null;

  const rawIdentifiers = dedupeIdentifiers([
    ...buildHashedUserIdentifiers(event.lead?.email, event.lead?.phone),
    ...buildHashedUserIdentifiers(event.client?.email, event.client?.phone),
  ]);
  const userIdentifiers = consentSnapshot?.ad_user_data === "GRANTED" ? rawIdentifiers : [];

  const adIdentifiers = {
    gclid: trimOrNull(touchpoint?.gclid),
    gbraid: trimOrNull(touchpoint?.gbraid),
    wbraid: trimOrNull(touchpoint?.wbraid),
    sessionAttributes: readGoogleSessionAttributes(touchpoint?.session_attributes),
  };
  const hasAdIdentifier = Boolean(
    adIdentifiers.gclid || adIdentifiers.gbraid || adIdentifiers.wbraid || adIdentifiers.sessionAttributes,
  );

  if (!hasAdIdentifier && userIdentifiers.length === 0) {
    await prisma.conversionUploadOutbox.update({
      where: { conversion_upload_outbox_id: job.conversion_upload_outbox_id },
      data: {
        processing_status: "suppressed",
        last_error: {
          code: "no_usable_identifiers",
          message: "No permitted Google click identifier or consented customer identifier is available.",
        },
      },
    });
    return { status: "suppressed" as const, outboxId: job.conversion_upload_outbox_id };
  }

  const loginAccountId = settings?.login_customer_id ?? trimOrNull(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const cloudProjectId = settings?.cloud_project_id ?? trimOrNull(process.env.GOOGLE_CLOUD_PROJECT_ID);
  const requestBody = buildDataManagerEventsRequest({
    operatingAccountId: job.destination_account_id,
    loginAccountId,
    actionId: job.action_id,
    validateOnly,
    transactionId: event.transaction_id,
    eventTimestamp: event.occurred_at.toISOString(),
    eventSource: event.event_source,
    conversionValue: event.conversion_value == null ? null : Number(event.conversion_value.toString()),
    currency: event.currency,
    adIdentifiers,
    userIdentifiers,
    consent,
  });

  try {
    const accessToken = await getGoogleAccessToken(["https://www.googleapis.com/auth/datamanager"]);
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    };
    if (cloudProjectId) headers["x-goog-user-project"] = cloudProjectId;

    const response = await fetch(DATA_MANAGER_EVENTS_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
    const responseBody = (await response.json().catch(() => null)) as DataManagerSuccess | null;

    if (response.ok) {
      await prisma.conversionUploadOutbox.update({
        where: { conversion_upload_outbox_id: job.conversion_upload_outbox_id },
        data: {
          processing_status: validateOnly ? "validated" : "submitted",
          submitted_at: new Date(),
          request_id: responseBody?.requestId ?? null,
          field_warnings: responseBody?.fieldWarnings?.length
            ? (responseBody.fieldWarnings as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          last_error: Prisma.JsonNull,
        },
      });
      return {
        status: validateOnly ? ("validated" as const) : ("submitted" as const),
        outboxId: job.conversion_upload_outbox_id,
        requestId: responseBody?.requestId ?? null,
        fieldWarnings: responseBody?.fieldWarnings ?? [],
      };
    }

    const retryable = isRetryableDataManagerStatus(response.status);
    const nextRetryAt = retryable
      ? new Date(Date.now() + retryDelayMs(job.attempts))
      : job.next_retry_at;
    await prisma.conversionUploadOutbox.update({
      where: { conversion_upload_outbox_id: job.conversion_upload_outbox_id },
      data: {
        processing_status: retryable ? "retry" : "needs_operator_action",
        next_retry_at: nextRetryAt,
        last_error: compactGoogleError(responseBody, response.status),
      },
    });
    return {
      status: retryable ? ("retry" as const) : ("needs_operator_action" as const),
      outboxId: job.conversion_upload_outbox_id,
      httpStatus: response.status,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown Data Manager transport error.";
    const permanentCredentialFailure =
      message.includes("credentials are not configured") || /OAuth token request failed \((400|401|403)\)/.test(message);
    const nextRetryAt = permanentCredentialFailure
      ? job.next_retry_at
      : new Date(Date.now() + retryDelayMs(job.attempts));

    await prisma.conversionUploadOutbox.update({
      where: { conversion_upload_outbox_id: job.conversion_upload_outbox_id },
      data: {
        processing_status: permanentCredentialFailure ? "needs_operator_action" : "retry",
        next_retry_at: nextRetryAt,
        last_error: {
          code: permanentCredentialFailure ? "google_credentials" : "transport_error",
          message: message.slice(0, 1000),
        },
      },
    });

    return {
      status: permanentCredentialFailure ? ("needs_operator_action" as const) : ("retry" as const),
      outboxId: job.conversion_upload_outbox_id,
    };
  }
}
