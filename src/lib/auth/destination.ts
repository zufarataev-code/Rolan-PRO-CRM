import { ROLE_CODES } from "@/lib/auth/constants";

/**
 * Куда попадает пользователь сразу после входа.
 *
 * Владелец и менеджер входят в новый интерфейс /crm (владелец, 2026-11-21:
 * «Да всю СРМ» — вся CRM на одном шаблоне shadcn/ui, #578). Разделы, которые
 * ещё не перерисованы, /crm открывает внутри себя из рабочей CRM, поэтому
 * ничего не теряется; прежний интерфейс /legacy-crm остаётся по ссылке.
 *
 * Замерщик и специалист по установке тоже входят в пространство /legacy-crm,
 * но получают защищённый рабочий раздел без финансовых данных.
 */
export function destinationForRoles(roles: string[]) {
  if (roles.includes(ROLE_CODES.OWNER)) return "/crm";
  if (roles.includes(ROLE_CODES.MANAGER)) return "/crm";
  if (roles.includes(ROLE_CODES.CONSULTANT)) return "/legacy-crm";
  if (roles.includes(ROLE_CODES.INSTALLER)) return "/legacy-crm";
  return "/login";
}
