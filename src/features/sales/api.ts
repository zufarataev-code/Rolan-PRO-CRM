import type { NextRequest } from "next/server";

import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";
import type { RoleCode } from "@/lib/auth/constants";

export function getManagerScope(request: NextRequest, session: { user: { user_id: string }; roles: string[] }) {
  const requestedManagerId = request.nextUrl.searchParams.get("manager_id");
  const isOwner = session.roles.includes(ROLE_CODES.OWNER);

  if (requestedManagerId && isOwner) {
    return requestedManagerId;
  }

  if (session.roles.includes(ROLE_CODES.MANAGER)) {
    return session.user.user_id;
  }

  return undefined;
}

export const MANAGER_ROLES: readonly RoleCode[] = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER];

export async function getPipelineStatusId(statusCode: string) {
  const status = await prisma.pipelineStatus.findUnique({
    where: {
      status_code: statusCode,
    },
    select: {
      pipeline_status_id: true,
      status_code: true,
    },
  });

  return status ?? null;
}
