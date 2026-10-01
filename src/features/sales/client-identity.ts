import type { Client, Prisma } from "@prisma/client";

import { normalizeEmail, normalizePhoneE164 } from "@/features/google-ads/normalization";

type ContactInput = {
  email?: string | null;
  phone?: string | null;
};

type ClientIdentityCandidate = ContactInput & {
  client_id?: string;
  id?: string;
  name?: string | null;
};

export type ClientIdentityMatch = "email" | "phone";

export type ClientIdentityDuplicate = {
  existingClientId: string;
  duplicateClientId: string;
  matchedBy: ClientIdentityMatch;
};

export function normalizeClientEmail(value: string | null | undefined) {
  return normalizeEmail(value);
}

export function normalizeClientPhone(value: string | null | undefined) {
  return normalizePhoneE164(value);
}

export function matchClientIdentity(
  candidate: ContactInput,
  contact: ContactInput,
): ClientIdentityMatch | null {
  const email = normalizeClientEmail(contact.email);
  const phone = normalizeClientPhone(contact.phone);

  if (email && normalizeClientEmail(candidate.email) === email) return "email";
  if (phone && normalizeClientPhone(candidate.phone) === phone) return "phone";
  return null;
}

export function findClientIdentityMatch<T extends ClientIdentityCandidate>(
  clients: T[],
  contact: ContactInput,
  excludeClientId?: string,
) {
  const identities: ClientIdentityMatch[] = ["email", "phone"];
  for (const identity of identities) {
    for (const client of clients) {
      const clientId = client.client_id ?? client.id ?? "";
      if (excludeClientId && clientId === excludeClientId) continue;
      const matchedBy = matchClientIdentity(client, {
        email: identity === "email" ? contact.email : null,
        phone: identity === "phone" ? contact.phone : null,
      });
      if (matchedBy) return { client, matchedBy };
    }
  }

  return null;
}

function clientId(client: ClientIdentityCandidate, index: number) {
  return client.client_id ?? client.id ?? `index:${index}`;
}

type ClientIdentityDuplicateWithValue = ClientIdentityDuplicate & { value: string };

export function findClientIdentityDuplicates(clients: ClientIdentityCandidate[]): ClientIdentityDuplicate[] {
  return findDuplicatesWithValues(clients).map(({ value: _value, ...duplicate }) => duplicate);
}

function findDuplicatesWithValues(clients: ClientIdentityCandidate[]) {
  const seen = new Map<string, string>();
  const duplicates: ClientIdentityDuplicateWithValue[] = [];

  clients.forEach((client, index) => {
    const duplicateClientId = clientId(client, index);
    const identities: Array<[ClientIdentityMatch, string | null]> = [
      ["email", normalizeClientEmail(client.email)],
      ["phone", normalizeClientPhone(client.phone)],
    ];

    for (const [matchedBy, value] of identities) {
      if (!value) continue;
      const key = `${matchedBy}:${value}`;
      const existingClientId = seen.get(key);
      if (existingClientId && existingClientId !== duplicateClientId) {
        duplicates.push({ existingClientId, duplicateClientId, matchedBy, value });
      } else {
        seen.set(key, duplicateClientId);
      }
    }
  });

  return duplicates;
}

// The shared value is part of the key: two historical cards that already share
// phone A and are both moved to phone B introduce a NEW shared identity.
function duplicateKey(duplicate: ClientIdentityDuplicateWithValue) {
  return `${duplicate.matchedBy}:${duplicate.value}:${[duplicate.existingClientId, duplicate.duplicateClientId].sort().join(":")}`;
}

/** Every pair of cards sharing an identity, so comparisons do not depend on list order. */
function allDuplicatePairKeys(clients: ClientIdentityCandidate[]) {
  const groups = new Map<string, Set<string>>();
  clients.forEach((client, index) => {
    const id = clientId(client, index);
    const identities: Array<[ClientIdentityMatch, string | null]> = [
      ["email", normalizeClientEmail(client.email)],
      ["phone", normalizeClientPhone(client.phone)],
    ];
    for (const [matchedBy, value] of identities) {
      if (!value) continue;
      const key = `${matchedBy}:${value}`;
      groups.set(key, (groups.get(key) ?? new Set()).add(id));
    }
  });
  const keys = new Set<string>();
  for (const [key, members] of groups) {
    const matchedBy = key.slice(0, key.indexOf(":")) as ClientIdentityMatch;
    const ids = [...members];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        keys.add(duplicateKey({ existingClientId: ids[i], duplicateClientId: ids[j], matchedBy, value: key.slice(key.indexOf(":") + 1) }));
      }
    }
  }
  return keys;
}

export function findIntroducedClientIdentityDuplicate(
  currentClients: ClientIdentityCandidate[],
  nextClients: ClientIdentityCandidate[],
) {
  const currentPairs = allDuplicatePairKeys(currentClients);
  const introduced = findDuplicatesWithValues(nextClients).find(
    (duplicate) => !currentPairs.has(duplicateKey(duplicate)),
  );
  if (!introduced) return null;
  const { value: _value, ...duplicate } = introduced;
  return duplicate;
}

function identityLockKeys(contact: ContactInput) {
  return [
    normalizeClientEmail(contact.email) ? `client:email:${normalizeClientEmail(contact.email)}` : null,
    normalizeClientPhone(contact.phone) ? `client:phone:${normalizeClientPhone(contact.phone)}` : null,
  ].filter((value): value is string => Boolean(value)).sort();
}

export async function lockClientIdentity(
  tx: Prisma.TransactionClient,
  contact: ContactInput,
) {
  for (const key of identityLockKeys(contact)) {
    // pg_advisory_xact_lock returns void, which $queryRaw cannot deserialize
    // (every client create with a phone or email failed with 500). $executeRaw
    // runs the statement without reading the result.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

/**
 * For updating a client's contacts: locks both the identities the card gives
 * up and the ones it takes (so a concurrent create cannot reuse a card that is
 * about to lose its phone/email), and returns only the identities that change —
 * unchanged contacts of preserved historical duplicates never block an edit.
 */
export async function lockClientIdentityUpdate(
  tx: Prisma.TransactionClient,
  clientId: string,
  next: ContactInput,
) {
  const current = await tx.client.findUnique({
    where: { client_id: clientId },
    select: { phone: true, email: true },
  });
  const keys = new Set([
    ...identityLockKeys(next),
    ...(current ? identityLockKeys(current) : []),
  ]);
  for (const key of [...keys].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
  const phoneChanged =
    next.phone !== undefined && normalizeClientPhone(next.phone) !== normalizeClientPhone(current?.phone);
  const emailChanged =
    next.email !== undefined && normalizeClientEmail(next.email) !== normalizeClientEmail(current?.email);
  return {
    phone: phoneChanged ? next.phone ?? null : null,
    email: emailChanged ? next.email ?? null : null,
  };
}

export type ExistingClientIdentity = {
  client: Client;
  matchedBy: ClientIdentityMatch;
  /**
   * Set when the email belongs to one client and the phone to another.
   * Callers must not pick either card silently: attaching a deal or proposal
   * to the wrong customer is worse than asking the manager.
   */
  conflictingClient?: Client;
  /** Every distinct card matching the email or the phone, most recently updated first. */
  matches: Client[];
};

export async function findExistingClientByIdentity(
  tx: Prisma.TransactionClient,
  contact: ContactInput,
  excludeClientId?: string,
): Promise<ExistingClientIdentity | null> {
  const normalizedEmail = normalizeClientEmail(contact.email);
  const normalizedPhone = normalizeClientPhone(contact.phone);
  if (!normalizedEmail && !normalizedPhone) return null;

  const clients = await tx.client.findMany({ orderBy: { updated_at: "desc" } });
  // Collect every distinct card matching either identity: historical
  // duplicates are preserved, so "first match" could silently pick the wrong one.
  const matches = clients.filter(
    (client) =>
      client.client_id !== excludeClientId &&
      ((normalizedEmail && normalizeClientEmail(client.email) === normalizedEmail) ||
        (normalizedPhone && normalizeClientPhone(client.phone) === normalizedPhone)),
  );
  if (!matches.length) return null;

  const primary =
    matches.find((client) => normalizedEmail && normalizeClientEmail(client.email) === normalizedEmail) ?? matches[0];
  const matchedBy: ClientIdentityMatch =
    normalizedEmail && normalizeClientEmail(primary.email) === normalizedEmail ? "email" : "phone";
  const conflicting = matches.find((client) => client.client_id !== primary.client_id);
  return { client: primary, matchedBy, conflictingClient: conflicting, matches };
}

/** The contact belongs to a client outside the caller's access scope: refuse without naming it. */
export class ClientNotAccessibleError extends Error {
  constructor() {
    super("Клиент с таким телефоном или почтой уже есть в CRM у другого менеджера. Обратитесь к руководителю.");
    this.name = "ClientNotAccessibleError";
  }
}

export class ClientIdentityConflictError extends Error {
  constructor(readonly emailClientId: string, readonly phoneClientId: string) {
    super("Телефон и почта принадлежат двум разным клиентам. Выберите клиента вручную.");
    this.name = "ClientIdentityConflictError";
  }
}
