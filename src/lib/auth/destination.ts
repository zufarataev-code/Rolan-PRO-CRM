import { ROLE_CODES } from "@/lib/auth/constants";
import { CRM_ROLE_ROUTES } from "@/lib/auth/canonical-route";

/**
 * Куда попадает пользователь сразу после входа.
 *
 * Владелец и менеджер работают в /legacy-crm — это рабочая система
 * с заказами, складом, зарплатой, учётом, календарём и почтой.
 * Разделы /owner и /manager содержат новые панели, которые пока
 * наполняются: отправлять туда после входа значит показывать
 * пустой экран вместо рабочего места.
 *
 * Замерщик и монтажник тоже входят в пространство /legacy-crm,
 * но получают защищённый рабочий раздел без финансовых данных.
 */
export function destinationForRoles(roles: string[]) {
  if (roles.includes(ROLE_CODES.OWNER)) return "/legacy-crm";
  if (roles.includes(ROLE_CODES.MANAGER)) return "/legacy-crm";
  if (roles.includes(ROLE_CODES.CONSULTANT)) return CRM_ROLE_ROUTES.consultant;
  if (roles.includes(ROLE_CODES.INSTALLER)) return CRM_ROLE_ROUTES.installer;
  return "/login";
}
