import type { NextRequest } from "next/server";

import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";

export const CONSULTATION_ACCESS_ROLES: readonly RoleCode[] = [
  ROLE_CODES.OWNER,
  ROLE_CODES.MANAGER,
  ROLE_CODES.CONSULTANT,
];

export const CONSULTATION_MANAGER_ROLES: readonly RoleCode[] = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER];

export function getConsultantScope(
  request: NextRequest,
  session: {
    user: { user_id: string };
    roles: string[];
  },
) {
  const requestedConsultantId = request.nextUrl.searchParams.get("consultant_id");
  const isOwner = session.roles.includes(ROLE_CODES.OWNER);

  if (requestedConsultantId && isOwner) {
    return requestedConsultantId;
  }

  if (session.roles.includes(ROLE_CODES.CONSULTANT)) {
    return session.user.user_id;
  }

  return requestedConsultantId ?? undefined;
}
