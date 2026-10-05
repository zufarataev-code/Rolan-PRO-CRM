import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

/**
 * «Посмотреть глазами сотрудника».
 *
 * Владелец включает просмотр — сервер кладёт cookie с id сотрудника. Пока она
 * есть, каждый запрос владельца обслуживается так, будто вошёл этот сотрудник:
 * те же роли, те же данные, те же скрытые финансы. Это не вход под чужим
 * паролем и не отдельная копия интерфейса, а тот же сервер с чужой точкой зрения.
 *
 * Просмотр только для чтения: любой изменяющий запрос отклоняется, пока
 * cookie стоит (см. `isPreviewWriteAllowed`). Cookie без настоящей сессии
 * владельца игнорируется — другой сотрудник не может ею воспользоваться.
 */

export {
  PREVIEW_COOKIE,
  PREVIEW_TTL_SECONDS,
  isPreviewWriteAllowed,
  isValidPreviewTarget,
} from "@/lib/auth/preview-edge";
import { isValidPreviewTarget } from "@/lib/auth/preview-edge";

type SessionUser = Awaited<ReturnType<typeof loadSessionUser>>;

export function loadSessionUser(userId: string) {
  return prisma.user.findUnique({
    where: { user_id: userId },
    include: {
      user_accesses: {
        where: { is_active: true, role: { is_active: true } },
        include: { role: true },
      },
    },
  });
}

export type PreviewInfo = {
  actorUserId: string;
  actorName: string;
  subjectUserId: string;
};

/**
 * Возвращает сессию сотрудника, если настоящая сессия — владелец и выбран
 * другой сотрудник. Иначе — `null`, и запрос обслуживается как обычно.
 */
export async function resolvePreviewSession<P>(
  realSession: { user: NonNullable<SessionUser>; roles: string[]; payload: P },
  previewCookieValue: string | undefined,
) {
  // Cookie: "<subjectUserId>.<actorUserId>[.<assignedRole>]" — only the owner who
  // started the preview is served as the employee.
  const [previewUserId, actorUserId, roleCode] = String(previewCookieValue || "").split(".");
  if (!realSession.roles.includes(ROLE_CODES.OWNER) || !isValidPreviewTarget(previewUserId)) {
    return null;
  }
  if (actorUserId !== realSession.user.user_id || previewUserId === realSession.user.user_id) {
    return null;
  }

  const subject = await loadSessionUser(previewUserId);
  if (!subject || !subject.is_active || subject.user_accesses.some((access) => access.role.code === ROLE_CODES.OWNER)) {
    return null;
  }

  const accesses = roleCode ? subject.user_accesses.filter(access => access.role.code === roleCode) : subject.user_accesses;
  if (!accesses.length) return null;

  return {
    user: { ...subject, user_accesses: accesses },
    roles: accesses.map((access) => access.role.code),
    payload: realSession.payload,
    preview: {
      actorUserId: realSession.user.user_id,
      actorName: realSession.user.full_name,
      subjectUserId: subject.user_id,
    } satisfies PreviewInfo,
  };
}
