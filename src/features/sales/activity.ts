import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

type SalesActivityInput = {
  actorUserId?: string | null;
  entityType: string;
  entityId?: string | null;
  projectId?: string | null;
  actionKey: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
};

export async function logSalesActivity(input: SalesActivityInput) {
  await prisma.activityLog.create({
    data: {
      actor_user_id: input.actorUserId ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      project_id: input.projectId ?? null,
      action_key: input.actionKey,
      message: input.message,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
}
