import type { Prisma } from "@prisma/client";
import { ROLE_CODES, type RoleCode } from "@/lib/auth/constants";
import { hashPassword } from "@/lib/auth/password";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
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

export const MIN_PASSWORD_LENGTH = PASSWORD_MIN_LENGTH;

export type TeamMemberInput = {
  email: string;
  fullName: string;
  roles: RoleCode[];
  password?: string;
  isActive?: boolean;
  legacyUserId?: string;
  /** For a new installer: the lead of their group. */
  installerLeadId?: string | null;
  /** For a new team lead: the initial group of 1–5 installers. */
  groupInstallerIds?: string[];
};

/** A lead exists, is active, and has room for one more installer. */
async function assertLeadCanTakeInstaller(
  leadId: string,
  installerId: string | null,
  db: Prisma.TransactionClient = prisma,
) {
  if (installerId && leadId === installerId) {
    throw new Error("Сотрудник не может быть руководителем сам себе.");
  }
  const lead = await db.user.findFirst({
    where: {
      user_id: leadId,
      is_active: true,
      user_accesses: { some: { is_active: true, role: { code: ROLE_CODES.INSTALLER_LEAD } } },
    },
    select: { user_id: true },
  });
  if (!lead) {
    throw new Error("Выбранный сотрудник не руководитель монтажной группы.");
  }
  const groupSize = await db.user.count({
    where: { installer_lead_id: leadId, is_active: true, ...(installerId ? { user_id: { not: installerId } } : {}) },
  });
  if (groupSize >= MAX_GROUP_INSTALLERS) {
    throw new Error(`В группе этого руководителя уже ${MAX_GROUP_INSTALLERS} монтажников.`);
  }
}

export type TeamMember = {
  userId: string;
  legacyUserIds: string[];
  email: string;
  fullName: string;
  roles: RoleCode[];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  /** Team lead of this installer's installation group, if any. */
  installerLeadId: string | null;
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

  // A team lead works on sites too; without INSTALLER the account could not use the CRM.
  if (roles.includes(ROLE_CODES.INSTALLER_LEAD) && !roles.includes(ROLE_CODES.INSTALLER)) {
    throw new Error("Руководитель монтажной группы должен иметь и роль «Главный специалист по установке».");
  }
}

export function assertValidPassword(password: string) {
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
    installerLeadId: user.installer_lead_id,
  }));
}

/**
 * Создаёт сотрудника с паролем и ролями.
 * Возвращает пароль один раз — чтобы владелец мог передать его лично.
 */
export async function createTeamMember(input: TeamMemberInput) {
  const email = normalizeEmail(input.email);
  const password = input.password?.trim() ?? "";
  const legacyUserId = input.legacyUserId?.trim() || null;

  assertValidEmail(email);
  assertValidRoles(input.roles);
  assertValidPassword(password);
  const createsLead = input.roles.includes(ROLE_CODES.INSTALLER_LEAD) && input.isActive !== false;
  const groupIds = createsLead ? await validateInstallerGroup("", input.groupInstallerIds ?? []) : [];
  const leadId = input.roles.includes(ROLE_CODES.INSTALLER) && !createsLead ? input.installerLeadId || null : null;
  if (leadId) await assertLeadCanTakeInstaller(leadId, null);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    throw new Error("Пользователь с такой почтой уже есть.");
  }

  if (legacyUserId) {
    const linkedUser = await prisma.user.findFirst({
      where: { legacy_user_ids: { has: legacyUserId } },
      select: { email: true },
    });

    if (linkedUser) {
      throw new Error(
        `Эта legacy-карточка уже привязана к другому серверному аккаунту (${linkedUser.email}). Сначала проверьте дубликат сотрудника.`,
      );
    }
  }

  const roles = await prisma.role.findMany({
    where: { code: { in: input.roles } },
    select: { role_id: true, code: true },
  });

  const resolvedCodes = new Set(roles.map((role) => role.code));
  const missingRoles = input.roles.filter((role) => !resolvedCodes.has(role));
  if (missingRoles.length) {
    throw new Error(
      `Роли ${missingRoles.join(", ")} не настроены на сервере. Обновите справочник ролей и повторите создание сотрудника.`,
    );
  }

  const user = await prisma.$transaction(async (tx) => {
    await lockInstallerGroups(tx);
    // Re-checked under the lock: the lead may have been disabled meanwhile.
    if (leadId) await assertLeadCanTakeInstaller(leadId, null, tx);
    const previousLeads = createsLead ? await currentLeadsOf(tx, groupIds) : [];
    const created = await tx.user.create({
      data: {
        email,
        full_name: input.fullName.trim(),
        password_hash: hashPassword(password),
        must_change_password: true,
        is_active: input.isActive ?? true,
        legacy_user_ids: legacyUserId ? [legacyUserId] : [],
        installer_lead_id: leadId,
        user_accesses: {
          create: roles.map((role) => ({ role_id: role.role_id })),
        },
      },
    });
    if (createsLead) await setInstallerGroup(created.user_id, groupIds, tx);
    await assertInstallerGroupsValid(tx, [leadId, created.user_id, ...previousLeads]);
    return created;
  });

  return {
    userId: user.user_id,
    legacyUserIds: user.legacy_user_ids,
    email: user.email,
    temporaryPassword: password,
  };
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
    /** null removes the installer from a group. */
    installerLeadId?: string | null;
    /** For a team lead: the complete group (validated before anything is written). */
    groupInstallerIds?: string[];
  },
) {
  if (input.installerLeadId) {
    await assertLeadCanTakeInstaller(input.installerLeadId, userId);
  }
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

  // Lead status after this update, from the request or the persisted roles.
  const currentRoles = user.user_accesses.map((access) => access.role.code as RoleCode);
  const nextRoles = input.roles ?? currentRoles;
  const nextActive = input.isActive ?? user.is_active;
  const willBeLead = nextActive && nextRoles.includes(ROLE_CODES.INSTALLER_LEAD);
  const becomesLead = willBeLead && !(user.is_active && currentRoles.includes(ROLE_CODES.INSTALLER_LEAD));
  if (input.groupInstallerIds && !willBeLead) {
    const releasing = currentRoles.includes(ROLE_CODES.INSTALLER_LEAD);
    if (!releasing) throw new Error("Группу можно назначить только действующему руководителю монтажной группы.");
    // A lead being switched off or demoted releases the group; the list is ignored.
    input = { ...input, groupInstallerIds: undefined };
  }
  if (input.groupInstallerIds) {
    input = { ...input, groupInstallerIds: await validateInstallerGroup(userId, input.groupInstallerIds) };
  } else if (becomesLead) {
    throw new Error(`Выберите монтажников группы: от 1 до ${MAX_GROUP_INSTALLERS}.`);
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

  const roleIds = input.roles
    ? await prisma.role.findMany({
        where: { code: { in: input.roles } },
        select: { role_id: true, code: true },
      })
    : null;

  if (input.roles && roleIds) {
    const resolved = new Set(roleIds.map((role) => role.code));
    const missing = input.roles.filter((role) => !resolved.has(role));
    if (missing.length) {
      throw new Error(`Роли ${missing.join(", ")} не настроены на сервере.`);
    }
  }

  // Roles and profile change together or not at all: a failure halfway used
  // to leave an employee with no roles.
  const updated = await prisma.$transaction(async (tx) => {
    await lockInstallerGroups(tx);
    // Re-checked under the lock: the destination lead may have been disabled or demoted meanwhile.
    if (input.installerLeadId) await assertLeadCanTakeInstaller(input.installerLeadId, userId, tx);
    const before = await tx.user.findUnique({ where: { user_id: userId }, select: { installer_lead_id: true } });
    const affectedLeads = [
      userId,
      before?.installer_lead_id,
      input.installerLeadId,
      ...(await currentLeadsOf(tx, input.groupInstallerIds ?? [])),
    ];
    if (roleIds) {
      await tx.userAccess.deleteMany({ where: { user_id: userId } });
      await tx.userAccess.createMany({
        data: roleIds.map((role, index) => ({ user_id: userId, role_id: role.role_id, is_primary: index === 0 })),
      });
    }

    // A lead who is switched off or loses the lead role releases their group.
    const staysLead = willBeLead;
    if (!staysLead) {
      await tx.user.updateMany({ where: { installer_lead_id: userId }, data: { installer_lead_id: null } });
    }
    if (input.groupInstallerIds && staysLead) {
      await tx.user.updateMany({
        where: { installer_lead_id: userId, user_id: { notIn: input.groupInstallerIds } },
        data: { installer_lead_id: null },
      });
      await tx.user.updateMany({ where: { user_id: { in: input.groupInstallerIds } }, data: { installer_lead_id: userId } });
    }

    const result = await tx.user.update({
      where: { user_id: userId },
      data: {
        email,
        full_name: input.fullName?.trim() ?? undefined,
        is_active: input.isActive ?? undefined,
        legacy_user_ids: shouldLinkLegacyUser && legacyUserId ? { push: legacyUserId } : undefined,
        // Someone switched off or no longer an installer leaves their group.
        installer_lead_id: !nextActive || !nextRoles.includes(ROLE_CODES.INSTALLER)
          ? null
          : input.installerLeadId === undefined ? undefined : input.installerLeadId,
      },
    });
    await assertInstallerGroupsValid(tx, affectedLeads);
    return result;
  });

  return { userId, email: updated.email, legacyUserIds: updated.legacy_user_ids };
}

export const MAX_GROUP_INSTALLERS = 5;

/** Serializes every installation-group change (capacity checks must see committed state). */
async function lockInstallerGroups(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('team:installer-groups'))`;
}

/**
 * After a change, every affected active lead must still have 1–5 active
 * installers. Runs inside the transaction, so a violation rolls everything back.
 */
async function assertInstallerGroupsValid(tx: Prisma.TransactionClient, leadIds: Iterable<string | null | undefined>) {
  const ids = [...new Set([...leadIds].filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const leads = await tx.user.findMany({
    where: {
      user_id: { in: ids },
      is_active: true,
      user_accesses: { some: { is_active: true, role: { code: ROLE_CODES.INSTALLER_LEAD } } },
    },
    select: { user_id: true, full_name: true },
  });
  for (const lead of leads) {
    const size = await tx.user.count({
      where: {
        installer_lead_id: lead.user_id,
        is_active: true,
        user_accesses: { some: { is_active: true, role: { code: ROLE_CODES.INSTALLER } } },
      },
    });
    if (size < 1) {
      throw new Error(
        `У руководителя ${lead.full_name} не останется ни одного монтажника. Сначала добавьте ему другого монтажника или снимите роль руководителя.`,
      );
    }
    if (size > MAX_GROUP_INSTALLERS) {
      throw new Error(`В группе руководителя ${lead.full_name} уже ${MAX_GROUP_INSTALLERS} монтажников.`);
    }
  }
}

/** Leads whose groups a change can touch: current leads of the given installers. */
async function currentLeadsOf(tx: Prisma.TransactionClient, installerIds: string[]) {
  if (!installerIds.length) return [];
  const rows = await tx.user.findMany({
    where: { user_id: { in: installerIds } },
    select: { installer_lead_id: true },
  });
  return rows.map((row) => row.installer_lead_id);
}

/**
 * Installation group of a team lead: 1–5 installers chosen by name (owner
 * decision 2026-09-30). Replaces the lead's group in one transaction.
 */
/** Validates a lead's group request without writing anything. */
export async function validateInstallerGroup(leadId: string, installerIds: string[]) {
  const ids = [...new Set(installerIds.filter(Boolean))];
  if (ids.length < 1 || ids.length > MAX_GROUP_INSTALLERS) {
    throw new Error(`В группе руководителя должно быть от 1 до ${MAX_GROUP_INSTALLERS} монтажников.`);
  }
  if (leadId && ids.includes(leadId)) {
    throw new Error("Руководитель не может быть в своей группе как подчинённый.");
  }
  const installers = await prisma.user.findMany({
    where: {
      user_id: { in: ids },
      is_active: true,
      user_accesses: { some: { is_active: true, role: { code: ROLE_CODES.INSTALLER } } },
    },
    select: { user_id: true },
  });
  if (installers.length !== ids.length) {
    throw new Error("В группу можно добавить только действующих специалистов по установке.");
  }
  return ids;
}

/**
 * Installation group of a team lead: 1–5 installers chosen by name (owner
 * decision 2026-09-30). Replaces the lead's group in one transaction.
 */
export async function setInstallerGroup(leadId: string, installerIds: string[], tx: Prisma.TransactionClient = prisma) {
  const ids = await validateInstallerGroup(leadId, installerIds);
  const lead = await tx.user.findFirst({
    where: {
      user_id: leadId,
      is_active: true,
      user_accesses: { some: { is_active: true, role: { code: ROLE_CODES.INSTALLER_LEAD } } },
    },
    select: { user_id: true },
  });
  if (!lead) throw new Error("Этот сотрудник не руководитель монтажной группы.");
  await tx.user.updateMany({
    where: { installer_lead_id: leadId, user_id: { notIn: ids } },
    data: { installer_lead_id: null },
  });
  await tx.user.updateMany({ where: { user_id: { in: ids } }, data: { installer_lead_id: leadId } });
  return { leadId, installerIds: ids };
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
