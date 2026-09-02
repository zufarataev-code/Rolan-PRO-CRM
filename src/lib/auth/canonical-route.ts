export const CRM_ROLE_ROUTES = {
  consultant: "/legacy-crm",
  installer: "/legacy-crm",
  installerJobs: "/legacy-crm",
} as const;

export function notificationPathForRoles(roles: string[]) {
  if (roles.includes("INSTALLER") || roles.includes("CONSULTANT")) return "/legacy-crm";
  return "/notifications";
}

/**
 * Старые адреса сотрудников остаются только совместимыми входами.
 * Рабочие страницы всех ролей живут под единым пространством /legacy-crm.
 */
export function canonicalRolePath(pathname: string) {
  if (pathname === "/survey" || pathname.startsWith("/survey/")) {
    return CRM_ROLE_ROUTES.consultant;
  }

  if (pathname === "/installer" || pathname === "/installer/today") {
    return CRM_ROLE_ROUTES.installer;
  }

  if (pathname === "/installer/jobs" || pathname.startsWith("/installer/jobs/")) {
    return CRM_ROLE_ROUTES.installerJobs;
  }

  if (pathname.startsWith("/legacy-crm/survey") || pathname.startsWith("/legacy-crm/installer")) {
    return "/legacy-crm";
  }

  return pathname;
}
