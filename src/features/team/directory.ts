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

/**
 * Legacy cards carry ONE role each. An employee with several field roles has
 * one card per role (e.g. surveyor card + installer card) and switches between
 * them in the CRM («Сменить»). Owner/manager are single-card roles.
 */
export function legacyRolesForServerRoles(roles: readonly string[]): string[] {
  if (roles.includes(ROLE_CODES.OWNER)) return ["owner"];
  if (roles.includes(ROLE_CODES.MANAGER)) return ["manager"];
  const result: string[] = [];
  if (roles.includes(ROLE_CODES.CONSULTANT)) result.push("measurer");
  if (roles.includes(ROLE_CODES.INSTALLER)) result.push("installer");
  return result;
}

/** Card ids an employee needs: one per legacy role, existing ids first. */
export function legacyIdsForRoles(userId: string, existing: readonly string[], legacyRoles: readonly string[]) {
  const ids = [...existing];
  const base = ids[0] ?? legacyIdForUser(userId);
  if (!ids.length && legacyRoles.length) ids.push(base);
  for (const role of legacyRoles.slice(ids.length)) ids.push(`${base}_${role}`);
  return ids;
}

/** Which role each linked card gets: cards keep a role they already have, the rest are filled in order. */
function assignCardRoles(cardRoles: Array<string | undefined>, legacyRoles: readonly string[]) {
  const remaining = [...legacyRoles];
  const result: Array<string | null> = cardRoles.map((role) => {
    const index = role ? remaining.indexOf(role) : -1;
    if (index === -1) return null;
    remaining.splice(index, 1);
    return role as string;
  });
  return result.map((role) => role ?? remaining.shift() ?? legacyRoles[0]);
}

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
    const legacyRoles = legacyRolesForServerRoles(member.roles);
    if (!legacyRoles.length) continue;

    const cardRoles = assignCardRoles(
      member.legacyUserIds.map((legacyId) => {
        const position = index.get(legacyId);
        return position === undefined ? undefined : (cards[position].role as string | undefined);
      }),
      legacyRoles,
    );
    const rolesGiven = new Set<string>();
    for (const [cardIndex, legacyId] of member.legacyUserIds.entries()) {
      const role = cardRoles[cardIndex];
      // A card left over after a role was removed is switched off, never a duplicate.
      const cardActive = member.isActive && !rolesGiven.has(role);
      rolesGiven.add(role);
      const position = index.get(legacyId);
      if (position === undefined) {
        index.set(legacyId, cards.length);
        cards.push({ ...newCard(legacyId, member, role), active: cardActive });
        continue;
      }
      const card = cards[position];
      cards[position] = {
        ...card,
        name: member.fullName || (card.name as string) || member.email,
        email: member.email,
        role,
        title: LEGACY_TITLES[role] ?? card.title ?? "Employee",
        active: cardActive,
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
    const legacyRoles = legacyRolesForServerRoles(roles);
    // Only CRM workspace roles need cards; service actors (AI_SERVICE) do not.
    if (legacyRoles.length && legacyUserIds.length < legacyRoles.length) {
      const first = legacyUserIds.length
        ? legacyUserIds
        : [resolveLegacyIdForUser(user, cards, linked)];
      const needed = legacyIdsForRoles(user.user_id, first, legacyRoles);
      needed.forEach((id) => linked.add(id));
      if (persist) {
        const updated = await prisma.user.update({
          where: { user_id: user.user_id },
          data: { legacy_user_ids: { set: needed } },
          select: { legacy_user_ids: true },
        });
        legacyUserIds = updated.legacy_user_ids;
      } else {
        // Read-only callers (preview) get the same ids without writing them.
        legacyUserIds = needed;
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
  const legacyRoles = legacyRolesForServerRoles(roles);
  if (!legacyRoles.length || user.legacy_user_ids.length >= legacyRoles.length) {
    return user.legacy_user_ids;
  }
  const others = await prisma.user.findMany({
    where: { user_id: { not: user.user_id } },
    select: { legacy_user_ids: true },
  });
  const linked = new Set(others.flatMap((other) => other.legacy_user_ids));
  const first = user.legacy_user_ids.length
    ? user.legacy_user_ids
    : [resolveLegacyIdForUser(user, await loadWorkspaceUsers(), linked)];
  const needed = legacyIdsForRoles(user.user_id, first, legacyRoles);
  if (options.persist === false) {
    return needed;
  }
  const updated = await prisma.user.update({
    where: { user_id: user.user_id },
    data: { legacy_user_ids: { set: needed } },
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
