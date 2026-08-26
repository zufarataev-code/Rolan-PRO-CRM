import { ROLE_CODES } from "@/lib/auth/constants";

export function getMailHomeHref(roles: readonly string[]): "/owner" | "/manager" {
  return roles.includes(ROLE_CODES.OWNER) ? "/owner" : "/manager";
}
