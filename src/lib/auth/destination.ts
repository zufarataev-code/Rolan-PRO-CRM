import { ROLE_CODES } from "@/lib/auth/constants";

/**
 * Куда попадает пользователь сразу после входа.
 *
 * Владелец и менеджер работают в /legacy-crm — это рабочая система
 * с заказами, складом, зарплатой, учётом, календарём и почтой.
 * Разделы /owner и /manager содержат новые панели, которые пока
 * наполняются: отправлять туда после входа значит показывать
 * пустой экран вместо рабочего места.
 *
 * Замерщик и монтажник идут в свои экраны — они узкие по задаче
 * и не требуют полного интерфейса.
 */
export function destinationForRoles(roles: string[]) {
  if (roles.includes(ROLE_CODES.OWNER)) return "/legacy-crm";
  if (roles.includes(ROLE_CODES.MANAGER)) return "/legacy-crm";
  if (roles.includes(ROLE_CODES.CONSULTANT)) return "/survey";
  if (roles.includes(ROLE_CODES.INSTALLER)) return "/installer";
  return "/login";
}
