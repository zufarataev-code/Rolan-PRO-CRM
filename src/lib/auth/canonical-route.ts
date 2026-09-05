export const CRM_ROLE_ROUTES = {
  consultant: "/legacy-crm",
  installer: "/legacy-crm",
  installerJobs: "/legacy-crm",
  owner: "/legacy-crm",
  manager: "/legacy-crm",
} as const;

export function notificationPathForRoles(roles: string[]) {
  if (roles.includes("INSTALLER") || roles.includes("CONSULTANT")) return "/legacy-crm";
  return "/notifications";
}

/**
 * Старые и экспериментальные role-specific адреса остаются только
 * совместимыми входами. Пользовательский интерфейс CRM для всех ролей
 * открывается только в одном пространстве /legacy-crm.
 */
export function canonicalRolePath(pathname: string) {
  if (pathname === "/owner" || pathname.startsWith("/owner/")) {
    return CRM_ROLE_ROUTES.owner;
  }

  if (pathname === "/manager" || pathname.startsWith("/manager/")) {
    return CRM_ROLE_ROUTES.manager;
  }

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
