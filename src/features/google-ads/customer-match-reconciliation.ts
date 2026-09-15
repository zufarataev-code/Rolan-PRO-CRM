import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { GOOGLE_ADS_DEFAULT_SETTING_KEY } from "./conversion-events";
import {
  CustomerMatchValidationError,
  setCustomerMatchMembershipDesiredState,
} from "./customer-match";

const MAX_RECONCILE = 100;

function readIdentifiers(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const record = row as Record<string, Prisma.JsonValue>;
    return typeof record.emailAddress === "string" || typeof record.phoneNumber === "string";
  }) as Array<{ emailAddress?: string; phoneNumber?: string }>;
}

async function ensureSpecificRemoval(
  tx: Prisma.TransactionClient,
  membership: {
    customer_match_membership_id: string;
    applied_identifier_version: string | null;
    applied_identifier_snapshot: Prisma.JsonValue | null;
  },
) {
  let queued = false;
  if (membership.applied_identifier_version && membership.applied_identifier_snapshot) {
    const identifiers = readIdentifiers(membership.applied_identifier_snapshot);
    if (identifiers.length) {
      await tx.customerMatchOutbox.upsert({
        where: {
          customer_match_membership_id_operation_identifier_version: {
            customer_match_membership_id: membership.customer_match_membership_id,
            operation: "REMOVE",
            identifier_version: membership.applied_identifier_version,
          },
        },
        update: {},
        create: {
          customer_match_membership_id: membership.customer_match_membership_id,
          operation: "REMOVE",
          identifier_version: membership.applied_identifier_version,
          identifier_snapshot: identifiers as Prisma.InputJsonValue,
        },
      });
      queued = true;
    }
  }

  await tx.customerMatchMembership.update({
    where: { customer_match_membership_id: membership.customer_match_membership_id },
    data: {
      desired_state: "REMOVED",
      desired_identifier_version: null,
      desired_identifier_snapshot: Prisma.JsonNull,
    },
  });
  return queued;
}

export async function reconcileCustomerMatchMemberships(limit = MAX_RECONCILE) {
  const bounded = Math.max(1, Math.min(MAX_RECONCILE, Math.trunc(limit)));
  const settings = await prisma.googleAdsIntegrationSetting.findUnique({
    where: { setting_key: GOOGLE_ADS_DEFAULT_SETTING_KEY },
    select: {
      conversion_owner_customer_id: true,
      customer_match_user_list_id: true,
    },
  });
  if (!settings?.conversion_owner_customer_id || !settings.customer_match_user_list_id) {
    return {
      status: "awaiting_configuration" as const,
      scanned: 0,
      refreshed: 0,
      removed_for_privacy: 0,
      removal_queued: 0,
      blocked: 0,
      stale_destination: 0,
    };
  }

  const memberships = await prisma.customerMatchMembership.findMany({
    orderBy: [{ updated_at: "asc" }, { created_at: "asc" }],
    take: bounded,
  });

  let refreshed = 0;
  let removedForPrivacy = 0;
  let removalQueued = 0;
  let blocked = 0;
  let staleDestination = 0;

  for (const membership of memberships) {
    if (
      membership.destination_account_id !== settings.conversion_owner_customer_id ||
      membership.user_list_id !== settings.customer_match_user_list_id
    ) {
      staleDestination += 1;
      continue;
    }

    if (membership.desired_state === "REMOVED") {
      const queued = await prisma.$transaction((tx) => ensureSpecificRemoval(tx, membership));
      if (queued) removalQueued += 1;
      continue;
    }

    try {
      await prisma.$transaction((tx) =>
        setCustomerMatchMembershipDesiredState(tx, {
          subjectType: membership.subject_type,
          subjectId: membership.subject_id,
          desiredState: "ACTIVE",
        }),
      );
      refreshed += 1;
    } catch (cause) {
      if (cause instanceof CustomerMatchValidationError) {
        if (
          cause.code === "subject_not_found" ||
          cause.code === "audience_consent_not_granted" ||
          cause.code === "audience_identifier_missing"
        ) {
          const queued = await prisma.$transaction((tx) => ensureSpecificRemoval(tx, membership));
          removedForPrivacy += 1;
          if (queued) removalQueued += 1;
          continue;
        }
        blocked += 1;
        continue;
      }
      throw cause;
    }
  }

  return {
    status: memberships.length === bounded ? ("more_available" as const) : ("complete" as const),
    scanned: memberships.length,
    refreshed,
    removed_for_privacy: removedForPrivacy,
    removal_queued: removalQueued,
    blocked,
    stale_destination: staleDestination,
  };
}
