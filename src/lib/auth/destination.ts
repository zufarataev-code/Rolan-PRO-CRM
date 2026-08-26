import { ROLE_CODES } from "@/lib/auth/constants";

export function destinationForRoles(roles: string[]) {
  if (roles.includes(ROLE_CODES.OWNER)) return "/owner";
  if (roles.includes(ROLE_CODES.MANAGER)) return "/manager";
  if (roles.includes(ROLE_CODES.CONSULTANT)) return "/survey";
  if (roles.includes(ROLE_CODES.INSTALLER)) return "/installer";
  return "/login";
}
