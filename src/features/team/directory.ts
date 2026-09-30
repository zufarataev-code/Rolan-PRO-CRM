import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

/**
 * One employee directory (DECISIONS.md, 2026-09-29).
 *
 * PostgreSQL `User` + roles is the only list of employees. The legacy CRM
 * payload still needs a card per employee (`payload.users`), so the server
 * derives those cards from PostgreSQL on every read and every save:
 *
 * - every employee always has a linked legacy card, created server-side, so
 *   an employee can sign in before the owner ever opens the CRM;
 * - name, email, role and active status always come from PostgreSQL, so a
 *   browser can no longer overwrite them (legacy code used to force fixed
 *   roles on five built-in ids on every load);
 * - legacy-only fields (phone, photo, pay settings, …) stay on the card;
 * - cards not linked to any employee are left untouched: orders may still
 *   reference them.
 */

export type DirectoryMember = {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  isActive: boolean;
  legacyUserIds: string[];
};

type LegacyCard = Record<string, unknown> & { id: string };

export function legacyRoleForServerRoles(roles: readonly string[]) {
  if (roles.includes(ROLE_CODES.OWNER)) return "owner";
  if (roles.includes(ROLE_CODES.MANAGER)) return "manager";
  if (roles.includes(ROLE_CODES.CONSULTANT)) return "measurer";
  if (roles.includes(ROLE_CODES.INSTALLER)) return "installer";
  return null;
}

const LEGACY_TITLES: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  measurer: "Measurer",
  installer: "Installation specialist",
};

export function legacyIdForUser(userId: string) {
  return `u_srv_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18)}`;
}

function newCard(id: string, member: DirectoryMember, role: string): LegacyCard {
  return {
    id,
    name: member.fullName || member.email,
    email: member.email,
    phone: "",
    role,
    title: LEGACY_TITLES[role] ?? "Employee",
    active: member.isActive,
    commissionPct: 0,
    hourlyRate: 0,
    lang: "ru",
    payConfig:
      role === "installer"
        ? { type: "per_sqft", ratePerSqft: 0, ratesByCategory: {}, ratesByWorkType: {} }
        : {},
    pin: "",
    telegramChatId: "",
  };
}

/**
 * Pure: returns a payload whose employee cards match PostgreSQL. Never
 * mutates the input. `members` must already carry at least one legacy id each
 * (see `loadDirectoryMembers`).
 */
export function applyEmployeeDirectory<T extends Record<string, unknown>>(
  payload: T,
  members: readonly DirectoryMember[],
): T {
  const source = Array.isArray(payload.users) ? (payload.users as unknown[]) : [];
  const cards: LegacyCard[] = source
    .filter((card): card is LegacyCard => Boolean(card && typeof card === "object" && typeof (card as LegacyCard).id === "string"))
    .map((card) => ({ ...card }));
  const index = new Map(cards.map((card, position) => [card.id, position]));

  for (const member of members) {
    const role = legacyRoleForServerRoles(member.roles);
    if (!role) continue;

    for (const legacyId of member.legacyUserIds) {
      const position = index.get(legacyId);
      if (position === undefined) {
        index.set(legacyId, cards.length);
        cards.push(newCard(legacyId, member, role));
        continue;
      }
      const card = cards[position];
      cards[position] = {
        ...card,
        name: member.fullName || (card.name as string) || member.email,
        email: member.email,
        role,
        title: LEGACY_TITLES[role] ?? card.title ?? "Employee",
        active: member.isActive,
      };
    }
  }

  return { ...payload, users: cards };
}

function cardsOf(payloadUsers: unknown): LegacyCard[] {
  return Array.isArray(payloadUsers)
    ? payloadUsers.filter((card): card is LegacyCard => Boolean(card && typeof card === "object" && typeof (card as LegacyCard).id === "string"))
    : [];
}

/**
 * The legacy card id an unlinked employee should get: an existing card with
 * the same email (not already linked to someone else) keeps the employee's
 * history — orders are assigned by card id — otherwise a stable new id.
 */
export function resolveLegacyIdForUser(
  user: { user_id: string; email: string },
  payloadUsers: unknown,
  idsLinkedToOthers: ReadonlySet<string>,
) {
  const email = user.email.trim().toLowerCase();
  const existing = cardsOf(payloadUsers).find(
    (card) =>
      !idsLinkedToOthers.has(card.id) &&
      typeof card.email === "string" &&
      card.email.trim().toLowerCase() === email,
  );
  return existing?.id ?? legacyIdForUser(user.user_id);
}

/**
 * Loads every employee and makes sure each has a legacy card id. Employees
 * created without one (or before this rule) get a stable server-assigned id,
 * persisted once, so their login never depends on a browser sync.
 */
export async function loadDirectoryMembers(
  payloadUsers?: unknown,
  options: { persist?: boolean } = {},
): Promise<DirectoryMember[]> {
  const persist = options.persist !== false;
  const users = await prisma.user.findMany({
    include: {
      user_accesses: {
        where: { is_active: true, role: { is_active: true } },
        include: { role: { select: { code: true } } },
      },
    },
  });

  const cards = payloadUsers === undefined ? await loadWorkspaceUsers() : payloadUsers;
  const linked = new Set(users.flatMap((user) => user.legacy_user_ids));
  const members: DirectoryMember[] = [];
  for (const user of users) {
    const roles = user.user_accesses.map((access) => access.role.code);
    let legacyUserIds = user.legacy_user_ids;
    // Only CRM workspace roles need a card; service actors (AI_SERVICE) do not.
    if (legacyUserIds.length === 0 && legacyRoleForServerRoles(roles)) {
      const assigned = resolveLegacyIdForUser(user, cards, linked);
      linked.add(assigned);
      if (persist) {
        const updated = await prisma.user.update({
          where: { user_id: user.user_id },
          data: { legacy_user_ids: { set: [assigned] } },
          select: { legacy_user_ids: true },
        });
        legacyUserIds = updated.legacy_user_ids;
      } else {
        // Read-only callers (preview) get the same id without writing it.
        legacyUserIds = [assigned];
      }
    }
    members.push({
      userId: user.user_id,
      email: user.email,
      fullName: user.full_name,
      roles,
      isActive: user.is_active,
      legacyUserIds,
    });
  }
  return members;
}

/**
 * Same guarantee as `loadDirectoryMembers`, for one user: returns the user's
 * legacy card ids, assigning a stable one first if a CRM employee has none.
 */
export async function ensureLegacyIdentity(
  user: { user_id: string; email: string; legacy_user_ids: string[] },
  roles: readonly string[],
  options: { persist?: boolean } = {},
) {
  if (user.legacy_user_ids.length > 0 || !legacyRoleForServerRoles(roles)) {
    return user.legacy_user_ids;
  }
  const others = await prisma.user.findMany({
    where: { user_id: { not: user.user_id } },
    select: { legacy_user_ids: true },
  });
  const linked = new Set(others.flatMap((other) => other.legacy_user_ids));
  const assigned = resolveLegacyIdForUser(user, await loadWorkspaceUsers(), linked);
  if (options.persist === false) {
    return [assigned];
  }
  const updated = await prisma.user.update({
    where: { user_id: user.user_id },
    data: { legacy_user_ids: { set: [assigned] } },
    select: { legacy_user_ids: true },
  });
  return updated.legacy_user_ids;
}

async function loadWorkspaceUsers() {
  const workspace = await prisma.legacyWorkspace.findUnique({
    where: { workspace_id: "primary" },
    select: { payload: true },
  });
  return (workspace?.payload as { users?: unknown } | null)?.users ?? [];
}
