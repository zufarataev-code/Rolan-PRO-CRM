import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { GOOGLE_ADS_DEFAULT_SETTING_KEY } from "./conversion-events";
import { isAudienceConsentEligible } from "./customer-match";
import { getGoogleAccessToken } from "./oauth";

const DATA_MANAGER_AUDIENCE_INGEST_ENDPOINT =
  "https://datamanager.googleapis.com/v1/audienceMembers:ingest";
const DATA_MANAGER_AUDIENCE_REMOVE_ENDPOINT =
  "https://datamanager.googleapis.com/v1/audienceMembers:remove";
const STALE_SUBMISSION_MS = 10 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

type HashedIdentifier = { emailAddress?: string; phoneNumber?: string };

type AudienceRequestInput = {
  operatingAccountId: string;
  loginAccountId?: string | null;
  userListId: string;
  operation: "ADD" | "REMOVE";
  identifiers: HashedIdentifier[];
  validateOnly: boolean;
};

type DataManagerAudienceSuccess = {
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

export function readCustomerMatchIdentifierSnapshot(value: Prisma.JsonValue): HashedIdentifier[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is HashedIdentifier => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const record = row as Record<string, Prisma.JsonValue>;
    const email = typeof record.emailAddress === "string" ? record.emailAddress : null;
    const phone = typeof record.phoneNumber === "string" ? record.phoneNumber : null;
    return Boolean(email || phone);
  }) as HashedIdentifier[];
}

export function buildCustomerMatchAudienceRequest(input: AudienceRequestInput) {
  if (!input.identifiers.length) throw new Error("Customer Match identifier snapshot is empty.");

  const destination: Record<string, unknown> = {
    operatingAccount: {
      accountType: "GOOGLE_ADS",
      accountId: input.operatingAccountId,
    },
    productDestinationId: input.userListId,
  };
  if (input.loginAccountId) {
    destination.loginAccount = {
      accountType: "GOOGLE_ADS",
      accountId: input.loginAccountId,
    };
  }

  const body: Record<string, unknown> = {
    destinations: [destination],
    audienceMembers: [
      {
        compositeData: {
          userData: {
            userIdentifiers: input.identifiers,
          },
        },
      },
    ],
    encoding: "HEX",
    validateOnly: input.validateOnly,
  };

  if (input.operation === "ADD") {
    body.consent = {
      adUserData: "CONSENT_GRANTED",
      adPersonalization: "CONSENT_GRANTED",
    };
    body.termsOfService = {
      customerMatchTermsOfServiceStatus: "ACCEPTED",
    };
  }

  return body;
}

export function isRetryableCustomerMatchStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export function customerMatchRetryDelayMs(attempts: number, random = Math.random()) {
  const exponent = Math.max(0, Math.min(8, attempts - 1));
  const base = Math.min(MAX_RETRY_DELAY_MS, 30_000 * 2 ** exponent);
  const jitter = Math.floor(base * 0.25 * Math.max(0, Math.min(1, random)));
  return Math.min(MAX_RETRY_DELAY_MS, base + jitter);
}

function compactGoogleError(body: unknown, status: number) {
  if (!body || typeof body !== "object") {
    return { status, message: "Google Data Manager audience request failed." };
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
        : "Google Data Manager audience request failed.",
  };
}

async function loadLatestConsent(subjectType: string, subjectId: string) {
  if (subjectType === "lead") {
    return prisma.consentSnapshot.findFirst({
      where: { lead_id: subjectId },
      orderBy: [{ effective_at: "desc" }, { created_at: "desc" }],
      select: { ad_user_data: true, ad_personalization: true, audience_marketing_eligible: true },
    });
  }
  if (subjectType === "client") {
    return prisma.consentSnapshot.findFirst({
      where: { client_id: subjectId },
      orderBy: [{ effective_at: "desc" }, { created_at: "desc" }],
      select: { ad_user_data: true, ad_personalization: true, audience_marketing_eligible: true },
    });
  }
  return null;
}

async function claimNextCustomerMatchOutbox() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_SUBMISSION_MS);
  const claimableWhere = {
    OR: [
      { processing_status: { in: ["queued", "retry"] }, next_retry_at: { lte: now } },
      { processing_status: "submitting", updated_at: { lte: staleBefore } },
    ],
  } satisfies Prisma.CustomerMatchOutboxWhereInput;

  const candidates = await prisma.customerMatchOutbox.findMany({
    where: claimableWhere,
    orderBy: [{ next_retry_at: "asc" }, { created_at: "asc" }],
    take: 5,
    select: { customer_match_outbox_id: true },
  });

  for (const candidate of candidates) {
    const claimed = await prisma.customerMatchOutbox.updateMany({
      where: { customer_match_outbox_id: candidate.customer_match_outbox_id, ...claimableWhere },
      data: {
        processing_status: "submitting",
        attempts: { increment: 1 },
        last_error: Prisma.JsonNull,
      },
    });
    if (claimed.count !== 1) continue;
    return prisma.customerMatchOutbox.findUnique({
      where: { customer_match_outbox_id: candidate.customer_match_outbox_id },
      include: { membership: true },
    });
  }
  return null;
}

async function suppressAddForConsent(job: NonNullable<Awaited<ReturnType<typeof claimNextCustomerMatchOutbox>>>) {
  await prisma.$transaction(async (tx) => {
    await tx.customerMatchOutbox.update({
      where: { customer_match_outbox_id: job.customer_match_outbox_id },
      data: {
        processing_status: "suppressed",
        last_error: {
          code: "audience_consent_not_granted",
          message: "Customer Match ADD was suppressed because current consent is not explicitly granted.",
        },
      },
    });

    await tx.customerMatchMembership.update({
      where: { customer_match_membership_id: job.customer_match_membership_id },
      data: {
        desired_state: "REMOVED",
        desired_identifier_version: null,
        desired_identifier_snapshot: Prisma.JsonNull,
      },
    });

    if (job.membership.applied_identifier_version && job.membership.applied_identifier_snapshot) {
      const identifiers = readCustomerMatchIdentifierSnapshot(job.membership.applied_identifier_snapshot);
      if (identifiers.length) {
        await tx.customerMatchOutbox.upsert({
          where: {
            customer_match_membership_id_operation_identifier_version: {
              customer_match_membership_id: job.customer_match_membership_id,
              operation: "REMOVE",
              identifier_version: job.membership.applied_identifier_version,
            },
          },
          update: {},
          create: {
            customer_match_membership_id: job.customer_match_membership_id,
            operation: "REMOVE",
            identifier_version: job.membership.applied_identifier_version,
            identifier_snapshot: identifiers as Prisma.InputJsonValue,
          },
        });
      }
    }
  });
}

async function markLiveSuccess(
  job: NonNullable<Awaited<ReturnType<typeof claimNextCustomerMatchOutbox>>>,
  requestId: string | null,
) {
  await prisma.$transaction(async (tx) => {
    await tx.customerMatchOutbox.update({
      where: { customer_match_outbox_id: job.customer_match_outbox_id },
      data: {
        processing_status: "submitted",
        submitted_at: new Date(),
        request_id: requestId,
        last_error: Prisma.JsonNull,
      },
    });

    if (job.operation === "ADD") {
      await tx.customerMatchMembership.update({
        where: { customer_match_membership_id: job.customer_match_membership_id },
        data: {
          applied_state: "ACTIVE",
          applied_identifier_version: job.identifier_version,
          applied_identifier_snapshot: job.identifier_snapshot as Prisma.InputJsonValue,
          last_synced_at: new Date(),
        },
      });
      return;
    }

    // A stale REMOVE for an old identifier must never erase a newer applied identity.
    if (job.membership.applied_identifier_version === job.identifier_version) {
      await tx.customerMatchMembership.update({
        where: { customer_match_membership_id: job.customer_match_membership_id },
        data: {
          applied_state: "REMOVED",
          applied_identifier_version: null,
          applied_identifier_snapshot: Prisma.JsonNull,
          last_synced_at: new Date(),
        },
      });
    }
  });
}

export async function processNextCustomerMatchUpload() {
  const settings = await prisma.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    select: {
      upload_enabled: true,
      validate_only: true,
      login_customer_id: true,
      customer_match_enabled: true,
      customer_match_terms_accepted: true,
    },
  });

  const uploadEnabled = settings?.upload_enabled === true || envFlag("GOOGLE_ADS_UPLOAD_ENABLED", false);
  if (!uploadEnabled) return { status: "disabled" as const };

  const validateOnly = (settings?.validate_only ?? true) || envFlag("GOOGLE_ADS_VALIDATE_ONLY", true);
  const job = await claimNextCustomerMatchOutbox();
  if (!job) return { status: "idle" as const };

  const identifiers = readCustomerMatchIdentifierSnapshot(job.identifier_snapshot);
  if (!identifiers.length) {
    await prisma.customerMatchOutbox.update({
      where: { customer_match_outbox_id: job.customer_match_outbox_id },
      data: {
        processing_status: "needs_operator_action",
        last_error: { code: "identifier_snapshot_empty", message: "Hashed identifier snapshot is empty." },
      },
    });
    return { status: "needs_operator_action" as const, outboxId: job.customer_match_outbox_id };
  }

  if (job.operation === "ADD") {
    const consent = await loadLatestConsent(job.membership.subject_type, job.membership.subject_id);
    if (!isAudienceConsentEligible(consent)) {
      await suppressAddForConsent(job);
      return { status: "suppressed" as const, outboxId: job.customer_match_outbox_id };
    }
    if (!settings?.customer_match_enabled) {
      await prisma.customerMatchOutbox.update({
        where: { customer_match_outbox_id: job.customer_match_outbox_id },
        data: {
          processing_status: "suppressed",
          last_error: { code: "customer_match_disabled", message: "Customer Match ADD is disabled." },
        },
      });
      return { status: "suppressed" as const, outboxId: job.customer_match_outbox_id };
    }
    if (!settings.customer_match_terms_accepted) {
      await prisma.customerMatchOutbox.update({
        where: { customer_match_outbox_id: job.customer_match_outbox_id },
        data: {
          processing_status: "needs_operator_action",
          last_error: {
            code: "customer_match_terms_not_accepted",
            message: "Customer Match Terms of Service have not been confirmed.",
          },
        },
      });
      return { status: "needs_operator_action" as const, outboxId: job.customer_match_outbox_id };
    }
    if (
      job.membership.desired_state !== "ACTIVE" ||
      job.membership.desired_identifier_version !== job.identifier_version
    ) {
      await prisma.customerMatchOutbox.update({
        where: { customer_match_outbox_id: job.customer_match_outbox_id },
        data: {
          processing_status: "suppressed",
          last_error: { code: "stale_add", message: "Customer Match ADD no longer matches desired state." },
        },
      });
      return { status: "suppressed" as const, outboxId: job.customer_match_outbox_id };
    }
  }

  let requestBody: ReturnType<typeof buildCustomerMatchAudienceRequest>;
  try {
    requestBody = buildCustomerMatchAudienceRequest({
      operatingAccountId: job.membership.destination_account_id,
      loginAccountId: trimOrNull(settings?.login_customer_id),
      userListId: job.membership.user_list_id,
      operation: job.operation as "ADD" | "REMOVE",
      identifiers,
      validateOnly,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid Customer Match payload.";
    await prisma.customerMatchOutbox.update({
      where: { customer_match_outbox_id: job.customer_match_outbox_id },
      data: {
        processing_status: "needs_operator_action",
        last_error: { code: "invalid_customer_match_payload", message: message.slice(0, 1000) },
      },
    });
    return { status: "needs_operator_action" as const, outboxId: job.customer_match_outbox_id };
  }

  const endpoint =
    job.operation === "ADD" ? DATA_MANAGER_AUDIENCE_INGEST_ENDPOINT : DATA_MANAGER_AUDIENCE_REMOVE_ENDPOINT;

  try {
    const accessToken = await getGoogleAccessToken(["https://www.googleapis.com/auth/datamanager"]);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    const body = (await response.json().catch(() => null)) as DataManagerAudienceSuccess | null;
    const requestId = body?.requestId ?? null;

    if (response.ok) {
      if (validateOnly) {
        await prisma.customerMatchOutbox.update({
          where: { customer_match_outbox_id: job.customer_match_outbox_id },
          data: {
            processing_status: "validated",
            request_id: requestId,
            last_error: Prisma.JsonNull,
          },
        });
        return { status: "validated" as const, outboxId: job.customer_match_outbox_id, requestId };
      }

      await markLiveSuccess(job, requestId);
      return { status: "submitted" as const, outboxId: job.customer_match_outbox_id, requestId };
    }

    const retryable = isRetryableCustomerMatchStatus(response.status);
    await prisma.customerMatchOutbox.update({
      where: { customer_match_outbox_id: job.customer_match_outbox_id },
      data: {
        processing_status: retryable ? "retry" : "needs_operator_action",
        next_retry_at: retryable
          ? new Date(Date.now() + customerMatchRetryDelayMs(job.attempts))
          : job.next_retry_at,
        request_id: requestId,
        last_error: compactGoogleError(body, response.status),
      },
    });
    return {
      status: retryable ? ("retry" as const) : ("needs_operator_action" as const),
      outboxId: job.customer_match_outbox_id,
      httpStatus: response.status,
      requestId,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown Google Data Manager transport error.";
    const permanentCredentialFailure =
      message.includes("credentials are not configured") || /OAuth token request failed \((400|401|403)\)/.test(message);

    await prisma.customerMatchOutbox.update({
      where: { customer_match_outbox_id: job.customer_match_outbox_id },
      data: {
        processing_status: permanentCredentialFailure ? "needs_operator_action" : "retry",
        next_retry_at: permanentCredentialFailure
          ? job.next_retry_at
          : new Date(Date.now() + customerMatchRetryDelayMs(job.attempts)),
        last_error: {
          code: permanentCredentialFailure ? "google_credentials" : "transport_error",
          message: message.slice(0, 1000),
        },
      },
    });
    return {
      status: permanentCredentialFailure ? ("needs_operator_action" as const) : ("retry" as const),
      outboxId: job.customer_match_outbox_id,
    };
  }
}
