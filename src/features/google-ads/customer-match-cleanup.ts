import { Prisma } from "@prisma/client";

function readIdentifiers(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const record = row as Record<string, Prisma.JsonValue>;
    return typeof record.emailAddress === "string" || typeof record.phoneNumber === "string";
  }) as Array<{ emailAddress?: string; phoneNumber?: string }>;
}

/**
 * Removes all known Customer Match memberships for a CRM subject using the
 * exact hashed identifiers that were previously applied. The source Lead or
 * Client record does not need to still exist.
 */
export async function queueStoredCustomerMatchRemoval(
  tx: Prisma.TransactionClient,
  subjectType: string,
  subjectId: string,
) {
  const memberships = await tx.customerMatchMembership.findMany({
    where: {
      subject_type: subjectType.trim().toLowerCase(),
      subject_id: subjectId.trim(),
    },
    orderBy: { updated_at: "desc" },
  });

  const queuedOutboxIds: string[] = [];
  for (const membership of memberships) {
    if (membership.applied_identifier_version && membership.applied_identifier_snapshot) {
      const identifiers = readIdentifiers(membership.applied_identifier_snapshot);
      if (identifiers.length) {
        const row = await tx.customerMatchOutbox.upsert({
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
          select: { customer_match_outbox_id: true },
        });
        queuedOutboxIds.push(row.customer_match_outbox_id);
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
  }

  return {
    memberships,
    queuedOutboxIds,
  };
}
