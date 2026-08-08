import { ROLE_CODES } from "@/lib/auth/constants";

export const PROJECT_ACCESS_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;
export const PROJECT_RUNTIME_MANAGER_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;
export const INSTALLER_RUNTIME_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER, ROLE_CODES.INSTALLER] as const;
export const INSTALLER_ONLY_ROLES = [ROLE_CODES.INSTALLER] as const;

export const INSTALLER_JOB_STATUSES = {
  ASSIGNED: "assigned",
  ON_THE_WAY: "on_the_way",
  STARTED: "started",
  PAUSED: "paused",
  COMPLETED: "completed",
} as const;
