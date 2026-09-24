import { Prisma } from "@prisma/client";

import { GOOGLE_ADS_DEFAULT_SETTING_KEY } from "./conversion-events";
import { buildHashedUserIdentifiers, identifierVersion } from "./normalization";

export const CUSTOMER_MATCH_ADD = "ADD" as const;
export const CUSTOMER_MATCH_REMOVE = "REMOVE" as const;
export const CUSTOMER_MATCH_ACTIVE = "ACTIVE" as const;
export const CUSTOMER_MATCH_REMOVED = "REMOVED" as const;

export type CustomerMatchSubjectType = "lead" | "client";
export type CustomerMatchDesiredState = typeof CUSTOMER_MATCH_ACTIVE | typeof CUSTOMER_MATCH_REMOVED;

type HashedIdentifier = { emailAddress?: string; phoneNumber?: string };

export class CustomerMatchValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CustomerMatchValidationError";
  }
}

function fail(code: string, message: string): never {
  throw new CustomerMatchValidationError(code, message);
}

function normalizeSubjectType(value: string): CustomerMatchSubjectType {
  const normalized = value.trim().toLowerCase();
  if (normalized === "lead" || normalized === "client") return normalized;
  return fail("invalid_subject_type", "subject_type must be lead or client.");
}

export function normalizeCustomerMatchDesiredState(value: string): CustomerMatchDesiredState {
  const normalized = value.trim().toUpperCase();
  if (normalized === CUSTOMER_MATCH_ACTIVE || normalized === CUSTOMER_MATCH_REMOVED) return normalized;
  return fail("invalid_desired_state", "desired_state must be ACTIVE or REMOVED.");
}

export function isAudienceConsentEligible(consent: {
  ad_user_data: string;
  ad_personalization: string;
  audience_marketing_eligible: boolean;
} | null | undefined) {
  return Boolean(
    consent &&
      consent.ad_user_data === "GRANTED" &&
      consent.ad_personalization === "GRANTED" &&
      consent.audience_marketing_eligible === true,
  );
}

function jsonIdentifiers(value: Prisma.JsonValue | null | undefined): HashedIdentifier[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is HashedIdentifier => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const record = row as Record<string, Prisma.JsonValue>;
    const email = typeof record.emailAddress === "string" ? record.emailAddress : null;
    const phone = typeof record.phoneNumber === "string" ? record.phoneNumber : null;
    return Boolean(email || phone);
  }) as HashedIdentifier[];
}

function inputJson(value: HashedIdentifier[]) {
  return value as Prisma.InputJsonValue;
}

async function loadSubjectAndConsent(
  tx: Prisma.TransactionClient,
  subjectType: CustomerMatchSubjectType,
  subjectId: string,
) {
  if (subjectType === "lead") {
    const subject = await tx.lead.findUnique({
      where: { lead_id: subjectId },
      select: { lead_id: true, email: true, phone: true },
    });
    if (!subject) fail("subject_not_found", "Lead not found.");
    const consent = await tx.consentSnapshot.findFirst({
      where: { lead_id: subjectId },
      orderBy: [{ effective_at: "desc" }, { created_at: "desc" }],
      select: { ad_user_data: true, ad_personalization: true, audience_marketing_eligible: true },
    });
    return { email: subject.email, phone: subject.phone, consent };
  }

  const subject = await tx.client.findUnique({
    where: { client_id: subjectId },
    select: { client_id: true, email: true, phone: true },
  });
  if (!subject) fail("subject_not_found", "Client not found.");
  const consent = await tx.consentSnapshot.findFirst({
    where: { client_id: subjectId },
    orderBy: [{ effective_at: "desc" }, { created_at: "desc" }],
    select: { ad_user_data: true, ad_personalization: true, audience_marketing_eligible: true },
  });
  return { email: subject.email, phone: subject.phone, consent };
}

export type SetCustomerMatchMembershipInput = {
  subjectType: string;
  subjectId: string;
  desiredState: string;
};

/**
 * Persists desired Customer Match state and deterministic hashed snapshots.
 * It never calls Google. REMOVE intentionally remains possible after consent is withdrawn.
 */
export async function setCustomerMatchMembershipDesiredState(
  tx: Prisma.TransactionClient,
  input: SetCustomerMatchMembershipInput,
) {
  const subjectType = normalizeSubjectType(input.subjectType);
  const subjectId = input.subjectId?.trim();
  if (!subjectId) fail("subject_id_required", "subject_id is required.");
  const desiredState = normalizeCustomerMatchDesiredState(input.desiredState);

  const settings = await tx.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    select: {
      conversion_owner_customer_id: true,
      customer_match_user_list_id: true,
      customer_match_enabled: true,
      customer_match_terms_accepted: true,
      rule_version: true,
    },
  });

  if (!settings?.conversion_owner_customer_id || !settings.customer_match_user_list_id) {
    fail("customer_match_not_configured", "Customer Match destination account and user list are not configured.");
  }

  const subject = await loadSubjectAndConsent(tx, subjectType, subjectId);
  const currentIdentifiers = buildHashedUserIdentifiers(subject.email, subject.phone);
  const currentVersion = identifierVersion(subject.email, subject.phone);

  const membership = await tx.customerMatchMembership.upsert({
    where: {
      destination_account_id_user_list_id_subject_type_subject_id: {
        destination_account_id: settings.conversion_owner_customer_id,
        user_list_id: settings.customer_match_user_list_id,
        subject_type: subjectType,
        subject_id: subjectId,
      },
    },
    update: {},
    create: {
      subject_type: subjectType,
      subject_id: subjectId,
      destination_account_id: settings.conversion_owner_customer_id,
      user_list_id: settings.customer_match_user_list_id,
      desired_state: CUSTOMER_MATCH_REMOVED,
      applied_state: "UNKNOWN",
      rule_version: settings.rule_version,
    },
  });

  const queued: string[] = [];

  if (desiredState === CUSTOMER_MATCH_ACTIVE) {
    if (!settings.customer_match_enabled) {
      fail("customer_match_disabled", "Customer Match is disabled in integration settings.");
    }
    if (!settings.customer_match_terms_accepted) {
      fail("customer_match_terms_not_accepted", "Customer Match Terms of Service have not been confirmed.");
    }
    if (!isAudienceConsentEligible(subject.consent)) {
      fail("audience_consent_not_granted", "The latest audience consent is not explicitly granted.");
    }
    if (!currentIdentifiers.length) {
      fail("audience_identifier_missing", "No valid email or phone identifier is available for Customer Match.");
    }

    // If Google currently has a different identifier version, remove the old hashed
    // snapshot first so changed contact data cannot leave a stale audience identity.
    if (
      membership.applied_state === CUSTOMER_MATCH_ACTIVE &&
      membership.applied_identifier_version &&
      membership.applied_identifier_version !== currentVersion &&
      membership.applied_identifier_snapshot
    ) {
      const previousIdentifiers = jsonIdentifiers(membership.applied_identifier_snapshot);
      if (previousIdentifiers.length) {
        const row = await tx.customerMatchOutbox.upsert({
          where: {
            customer_match_membership_id_operation_identifier_version: {
              customer_match_membership_id: membership.customer_match_membership_id,
              operation: CUSTOMER_MATCH_REMOVE,
              identifier_version: membership.applied_identifier_version,
            },
          },
          update: {},
          create: {
            customer_match_membership_id: membership.customer_match_membership_id,
            operation: CUSTOMER_MATCH_REMOVE,
            identifier_version: membership.applied_identifier_version,
            identifier_snapshot: inputJson(previousIdentifiers),
          },
        });
        queued.push(row.customer_match_outbox_id);
      }
    }

    const add = await tx.customerMatchOutbox.upsert({
      where: {
        customer_match_membership_id_operation_identifier_version: {
          customer_match_membership_id: membership.customer_match_membership_id,
          operation: CUSTOMER_MATCH_ADD,
          identifier_version: currentVersion,
        },
      },
      update: {},
      create: {
        customer_match_membership_id: membership.customer_match_membership_id,
        operation: CUSTOMER_MATCH_ADD,
        identifier_version: currentVersion,
        identifier_snapshot: inputJson(currentIdentifiers),
      },
    });
    queued.push(add.customer_match_outbox_id);

    const updated = await tx.customerMatchMembership.update({
      where: { customer_match_membership_id: membership.customer_match_membership_id },
      data: {
        desired_state: CUSTOMER_MATCH_ACTIVE,
        desired_identifier_version: currentVersion,
        desired_identifier_snapshot: inputJson(currentIdentifiers),
        rule_version: settings.rule_version,
      },
    });

    return { membership: updated, queuedOutboxIds: queued };
  }

  // Removal is privacy-safe even after consent withdrawal. It uses the exact hashed
  // snapshot that was previously applied, not current contact details.
  if (membership.applied_identifier_version && membership.applied_identifier_snapshot) {
    const appliedIdentifiers = jsonIdentifiers(membership.applied_identifier_snapshot);
    if (appliedIdentifiers.length) {
      const remove = await tx.customerMatchOutbox.upsert({
        where: {
          customer_match_membership_id_operation_identifier_version: {
            customer_match_membership_id: membership.customer_match_membership_id,
            operation: CUSTOMER_MATCH_REMOVE,
            identifier_version: membership.applied_identifier_version,
          },
        },
        update: {},
        create: {
          customer_match_membership_id: membership.customer_match_membership_id,
          operation: CUSTOMER_MATCH_REMOVE,
          identifier_version: membership.applied_identifier_version,
          identifier_snapshot: inputJson(appliedIdentifiers),
        },
      });
      queued.push(remove.customer_match_outbox_id);
    }
  }

  const updated = await tx.customerMatchMembership.update({
    where: { customer_match_membership_id: membership.customer_match_membership_id },
    data: {
      desired_state: CUSTOMER_MATCH_REMOVED,
      desired_identifier_version: null,
      desired_identifier_snapshot: Prisma.JsonNull,
      rule_version: settings.rule_version,
    },
  });

  return { membership: updated, queuedOutboxIds: queued };
}
