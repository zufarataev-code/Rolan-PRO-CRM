export const CRM_ROLE_ROUTES = {
  consultant: "/legacy-crm/survey",
  installer: "/legacy-crm/installer",
  installerJobs: "/legacy-crm/installer/jobs",
} as const;

export function notificationPathForRoles(roles: string[]) {
  if (roles.includes("INSTALLER")) return `${CRM_ROLE_ROUTES.installer}/notifications`;
  if (roles.includes("CONSULTANT")) return `${CRM_ROLE_ROUTES.consultant}/notifications`;
  return "/notifications";
}

/**
 * Старые адреса сотрудников остаются только совместимыми входами.
 * Рабочие страницы всех ролей живут под единым пространством /legacy-crm.
 */
export function canonicalRolePath(pathname: string) {
  if (pathname === "/survey" || pathname.startsWith("/survey/")) {
    return `${CRM_ROLE_ROUTES.consultant}${pathname.slice("/survey".length)}`;
  }

  if (pathname === "/installer" || pathname === "/installer/today") {
    return CRM_ROLE_ROUTES.installer;
  }

  if (pathname === "/installer/jobs" || pathname.startsWith("/installer/jobs/")) {
    return `${CRM_ROLE_ROUTES.installerJobs}${pathname.slice("/installer/jobs".length)}`;
  }

  return pathname;
}
