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

export function findClientIdentityDuplicates(clients: ClientIdentityCandidate[]) {
  const seen = new Map<string, string>();
  const duplicates: ClientIdentityDuplicate[] = [];

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
        duplicates.push({ existingClientId, duplicateClientId, matchedBy });
      } else {
        seen.set(key, duplicateClientId);
      }
    }
  });

  return duplicates;
}

function duplicateKey(duplicate: ClientIdentityDuplicate) {
  return `${duplicate.matchedBy}:${[duplicate.existingClientId, duplicate.duplicateClientId].sort().join(":")}`;
}

export function findIntroducedClientIdentityDuplicate(
  currentClients: ClientIdentityCandidate[],
  nextClients: ClientIdentityCandidate[],
) {
  const currentPairs = new Set(findClientIdentityDuplicates(currentClients).map(duplicateKey));
  return findClientIdentityDuplicates(nextClients).find(
    (duplicate) => !currentPairs.has(duplicateKey(duplicate)),
  ) ?? null;
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
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

export async function findExistingClientByIdentity(
  tx: Prisma.TransactionClient,
  contact: ContactInput,
  excludeClientId?: string,
): Promise<{ client: Client; matchedBy: ClientIdentityMatch } | null> {
  const normalizedEmail = normalizeClientEmail(contact.email);
  const normalizedPhone = normalizeClientPhone(contact.phone);
  if (!normalizedEmail && !normalizedPhone) return null;

  const clients = await tx.client.findMany({ orderBy: { updated_at: "desc" } });
  const match = findClientIdentityMatch(clients, contact, excludeClientId);
  return match ? { client: match.client, matchedBy: match.matchedBy } : null;
}
