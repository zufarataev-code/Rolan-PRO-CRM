import type { Prisma } from "@prisma/client";

import { ROLE_CODES } from "@/lib/auth/constants";

export function getRecordManagerScope(session: { user: { user_id: string }; roles: string[] }) {
  if (session.roles.includes(ROLE_CODES.OWNER)) {
    return undefined;
  }

  return session.roles.includes(ROLE_CODES.MANAGER) ? session.user.user_id : undefined;
}

export function buildDealAccessWhere(dealId: string, managerId?: string): Prisma.DealWhereInput {
  return {
    deal_id: dealId,
    ...(managerId ? { assigned_manager_id: managerId } : {}),
  };
}

/**
 * A manager works their own leads and the shared queue of unassigned ones
 * (website and Messenger leads arrive without a manager). Another manager's
 * lead stays out of reach; processing an unassigned lead claims it.
 */
export function buildLeadScopeWhere(managerId?: string): Prisma.LeadWhereInput {
  return managerId ? { OR: [{ assigned_manager_id: managerId }, { assigned_manager_id: null }] } : {};
}

export function buildLeadAccessWhere(leadId: string, managerId?: string): Prisma.LeadWhereInput {
  return {
    lead_id: leadId,
    ...buildLeadScopeWhere(managerId),
  };
}

export function buildClientAccessWhere(clientId: string | undefined, managerId?: string): Prisma.ClientWhereInput {
  return {
    ...(clientId ? { client_id: clientId } : {}),
    ...(managerId
      ? {
          OR: [
            { deals: { some: { assigned_manager_id: managerId } } },
            { projects: { some: { manager_id: managerId } } },
          ],
        }
      : {}),
  };
}

/**
 * Clients a manager may reuse or be told about by contact match: their own
 * (via deals/projects) or not yet owned by anyone (no deal, no project — e.g.
 * a card the manager has just created). Another manager's client never.
 */
export function buildClientReuseWhere(managerId?: string): Prisma.ClientWhereInput {
  if (!managerId) return {};
  return {
    OR: [
      { deals: { some: { assigned_manager_id: managerId } } },
      { projects: { some: { manager_id: managerId } } },
      { AND: [{ deals: { none: {} } }, { projects: { none: {} } }] },
    ],
  };
}

export function buildTaskAccessWhere(taskId: string, managerId?: string): Prisma.TaskWhereInput {
  return {
    task_id: taskId,
    ...(managerId ? { assigned_to: managerId } : {}),
  };
}

export function buildFollowUpAccessWhere(followUpId: string, managerId?: string): Prisma.FollowUpWhereInput {
  return {
    follow_up_id: followUpId,
    ...(managerId ? { assigned_to: managerId } : {}),
  };
}

export function isCrossManagerAssignment(managerId: string | undefined, assignedUserId: string | null | undefined) {
  return managerId !== undefined && assignedUserId !== undefined && assignedUserId !== managerId;
}
