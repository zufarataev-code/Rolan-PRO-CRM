import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";

export const ROUTE_ROLE_RULES: Array<{
  prefix: string;
  roles: RoleCode[];
}> = [
  { prefix: "/owner", roles: [ROLE_CODES.OWNER] },
  { prefix: "/manager", roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] },
  {
    prefix: "/survey",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER, ROLE_CODES.CONSULTANT],
  },
  { prefix: "/installer", roles: [ROLE_CODES.INSTALLER] },
  { prefix: "/installer-app", roles: [ROLE_CODES.INSTALLER] },
  {
    prefix: "/crm",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
  },
  {
    prefix: "/projects",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
  },
  {
    prefix: "/clients",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
  },
  {
    prefix: "/dispatch",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
  },
  {
    prefix: "/scheduling",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
  },
  {
    prefix: "/schedule",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
  },
  {
    prefix: "/finance",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
  },
  {
    prefix: "/payroll",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
  },
  {
    prefix: "/inventory",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
  },
  {
    prefix: "/documents",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER],
  },
  {
    prefix: "/notifications",
    roles: [ROLE_CODES.OWNER, ROLE_CODES.MANAGER, ROLE_CODES.CONSULTANT, ROLE_CODES.INSTALLER],
  },
  {
    prefix: "/api/v1/settings",
    roles: [ROLE_CODES.OWNER],
  },
];

export function hasRole(userRoles: string[], requiredRole: RoleCode) {
  return userRoles.includes(requiredRole);
}

export function hasAnyRole(userRoles: string[], requiredRoles: readonly RoleCode[]) {
  return requiredRoles.some((role) => userRoles.includes(role));
}

export function getRolesForPath(pathname: string) {
  const rule = ROUTE_ROLE_RULES.find((candidate) => pathname.startsWith(candidate.prefix));
  return rule?.roles ?? null;
}
