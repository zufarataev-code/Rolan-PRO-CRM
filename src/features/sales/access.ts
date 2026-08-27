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

export function buildLeadAccessWhere(leadId: string, managerId?: string): Prisma.LeadWhereInput {
  return {
    lead_id: leadId,
    ...(managerId ? { assigned_manager_id: managerId } : {}),
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
