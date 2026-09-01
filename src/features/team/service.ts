import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";

/**
 * Управление сотрудниками.
 *
 * Владелец заводит людей сам: логин, пароль и роли задаются в CRM,
 * без обращения к разработчику и без правки базы вручную.
 *
 * Пароль всегда выдаётся с флагом must_change_password: тот, кто
 * его создал, знать постоянный пароль сотрудника не должен.
 */

export const MIN_PASSWORD_LENGTH = 10;

export type TeamMemberInput = {
  email: string;
  fullName: string;
  roles: RoleCode[];
  password?: string;
  isActive?: boolean;
};

export type TeamMember = {
  userId: string;
  legacyUserIds: string[];
  email: string;
  fullName: string;
  roles: RoleCode[];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function assertValidEmail(email: string) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Укажите корректную почту сотрудника.");
  }
}

function assertValidRoles(roles: RoleCode[]) {
  const known = new Set(Object.values(ROLE_CODES));
  const invalid = roles.filter((role) => !known.has(role));

  if (!roles.length) {
    throw new Error("Нужно указать хотя бы одну роль.");
  }

  if (invalid.length) {
    throw new Error(`Неизвестная роль: ${invalid.join(", ")}`);
  }
}

function assertValidPassword(password: string) {
  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`);
  }
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ is_active: "desc" }, { full_name: "asc" }],
    include: {
      user_accesses: {
        include: { role: { select: { code: true } } },
      },
    },
  });

  return users.map((user) => ({
    userId: user.user_id,
    legacyUserIds: user.legacy_user_ids,
    email: user.email,
    fullName: user.full_name,
    roles: user.user_accesses.map((access) => access.role.code as RoleCode),
    isActive: user.is_active,
    mustChangePassword: user.must_change_password,
    lastLoginAt: user.last_login_at,
  }));
}

/**
 * Создаёт сотрудника с паролем и ролями.
 * Возвращает пароль один раз — чтобы владелец мог передать его лично.
 */
export async function createTeamMember(input: TeamMemberInput) {
  const email = normalizeEmail(input.email);
  const password = input.password?.trim() ?? "";

  assertValidEmail(email);
  assertValidRoles(input.roles);
  assertValidPassword(password);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    throw new Error("Пользователь с такой почтой уже есть.");
  }

  const roles = await prisma.role.findMany({
    where: { code: { in: input.roles } },
    select: { role_id: true, code: true },
  });

  const user = await prisma.user.create({
    data: {
      email,
      full_name: input.fullName.trim(),
      password_hash: hashPassword(password),
      must_change_password: true,
      is_active: input.isActive ?? true,
      user_accesses: {
        create: roles.map((role) => ({ role_id: role.role_id })),
      },
    },
  });

  return { userId: user.user_id, email: user.email, temporaryPassword: password };
}

/** Меняет почту, имя, роли и активность. Пароль здесь не трогается. */
export async function updateTeamMember(
  userId: string,
  input: {
    email?: string;
    fullName?: string;
    roles?: RoleCode[];
    isActive?: boolean;
    legacyUserId?: string;
  },
) {
  if (input.roles) {
    assertValidRoles(input.roles);
  }

  const email = input.email === undefined ? undefined : normalizeEmail(input.email);
  if (email !== undefined) {
    assertValidEmail(email);
  }

  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    include: { user_accesses: { include: { role: { select: { code: true } } } } },
  });

  if (!user) {
    throw new Error("Сотрудник не найден.");
  }

  if (email !== undefined && email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.user_id !== userId) {
      throw new Error("Пользователь с такой почтой уже есть.");
    }
  }

  const legacyUserId = input.legacyUserId?.trim() || null;
  const shouldLinkLegacyUser = Boolean(legacyUserId && !user.legacy_user_ids.includes(legacyUserId));

  if (shouldLinkLegacyUser && legacyUserId) {
    const alreadyLinked = await prisma.user.findFirst({
      where: {
        user_id: { not: userId },
        legacy_user_ids: { has: legacyUserId },
      },
      select: { user_id: true, email: true },
    });

    if (alreadyLinked) {
      throw new Error(
        `Эта legacy-карточка уже привязана к другому серверному аккаунту (${alreadyLinked.email}). Сначала проверьте дубликат сотрудника.`,
      );
    }
  }

  // Последнего владельца нельзя ни отключить, ни лишить роли:
  // иначе в системе не останется никого, кто может заводить людей.
  const isOwner = user.user_accesses.some((access) => access.role.code === ROLE_CODES.OWNER);
  const losesOwner = input.roles ? !input.roles.includes(ROLE_CODES.OWNER) : false;
  const beingDisabled = input.isActive === false;

  if (isOwner && (losesOwner || beingDisabled)) {
    const activeOwners = await prisma.user.count({
      where: {
        is_active: true,
        user_id: { not: userId },
        user_accesses: { some: { role: { code: ROLE_CODES.OWNER } } },
      },
    });

    if (activeOwners === 0) {
      throw new Error("Нельзя убрать последнего владельца системы.");
    }
  }

  if (input.roles) {
    const roles = await prisma.role.findMany({
      where: { code: { in: input.roles } },
      select: { role_id: true },
    });

    await prisma.userAccess.deleteMany({ where: { user_id: userId } });
    await prisma.userAccess.createMany({
      data: roles.map((role) => ({ user_id: userId, role_id: role.role_id })),
    });
  }

  const updated = await prisma.user.update({
    where: { user_id: userId },
    data: {
      email,
      full_name: input.fullName?.trim() ?? undefined,
      is_active: input.isActive ?? undefined,
      legacy_user_ids: shouldLinkLegacyUser && legacyUserId ? { push: legacyUserId } : undefined,
    },
  });

  return { userId, email: updated.email, legacyUserIds: updated.legacy_user_ids };
}

/** Задаёт новый пароль сотруднику. Сотрудник сменит его при входе. */
export async function setTeamMemberPassword(userId: string, password: string) {
  assertValidPassword(password);

  const user = await prisma.user.findUnique({ where: { user_id: userId } });

  if (!user) {
    throw new Error("Сотрудник не найден.");
  }

  await prisma.user.update({
    where: { user_id: userId },
    data: {
      password_hash: hashPassword(password.trim()),
      must_change_password: true,
    },
  });

  return { userId, temporaryPassword: password.trim() };
}
