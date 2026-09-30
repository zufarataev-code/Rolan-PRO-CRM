import assert from "node:assert/strict";
import test from "node:test";

import {
  findClientIdentityDuplicates,
  findClientIdentityMatch,
  findIntroducedClientIdentityDuplicate,
  normalizeClientEmail,
  normalizeClientPhone,
} from "./client-identity";

test("normalizes equivalent client email and US phone values", () => {
  assert.equal(normalizeClientEmail(" John.Doe+Sales @ Gmail.com "), "johndoe@gmail.com");
  assert.equal(normalizeClientPhone("(805) 555-1212"), "+18055551212");
  assert.equal(normalizeClientPhone("+1 805 555 1212"), "+18055551212");
});

test("finds an existing client by either email or phone", () => {
  const clients = [
    { client_id: "client-a", name: "A", email: "office@example.com", phone: "(805) 555-0101" },
    { client_id: "client-b", name: "B", email: "sales@example.com", phone: "+1 818 555 0102" },
  ];

  assert.equal(findClientIdentityMatch(clients, { email: "OFFICE@example.com" })?.client.client_id, "client-a");
  assert.equal(findClientIdentityMatch(clients, { phone: "8185550102" })?.client.client_id, "client-b");
  assert.deepEqual(
    findClientIdentityMatch(clients, { email: "office@example.com", phone: "8185550102" }),
    { client: clients[0], matchedBy: "email" },
  );
  assert.equal(findClientIdentityMatch(clients, { phone: "8185550102" }, "client-b"), null);
});

test("reports duplicate cards and distinguishes a newly introduced duplicate", () => {
  const current = [
    { id: "a", email: "same@example.com", phone: "8055550101" },
    { id: "b", email: "same@example.com", phone: "8055550102" },
  ];
  const next = [
    ...current,
    { id: "c", email: "new@example.com", phone: "+1 805 555 0101" },
  ];

  assert.equal(findClientIdentityDuplicates(current).length, 1);
  assert.deepEqual(findIntroducedClientIdentityDuplicate(current, next), {
    existingClientId: "a",
    duplicateClientId: "c",
    matchedBy: "phone",
  });
});

test("a contact whose email and phone belong to two different clients is reported as a conflict", async () => {
  const { findExistingClientByIdentity } = await import("./client-identity");
  const clients = [
    { client_id: "A", email: "anna@example.com", phone: "+18055550100" },
    { client_id: "B", email: "bob@example.com", phone: "+18055550199" },
  ];
  const tx = { client: { findMany: async () => clients } } as never;

  const conflict = await findExistingClientByIdentity(tx, { email: "ANNA@example.com", phone: "(805) 555-0199" });
  assert.equal(conflict?.client.client_id, "A");
  assert.equal(conflict?.conflictingClient?.client_id, "B", "the second match is not silently ignored");

  const clean = await findExistingClientByIdentity(tx, { email: "anna@example.com", phone: "805-555-0100" });
  assert.equal(clean?.client.client_id, "A");
  assert.equal(clean?.conflictingClient, undefined);
});

test("historical duplicate cards with the same phone are reported, not silently picked", async () => {
  const { findExistingClientByIdentity } = await import("./client-identity");
  const tx = {
    client: {
      findMany: async () => [
        { client_id: "OLD1", email: null, phone: "+18055550142" },
        { client_id: "OLD2", email: null, phone: "(805) 555-0142" },
      ],
    },
  } as never;

  const match = await findExistingClientByIdentity(tx, { phone: "805-555-0142" });
  assert.ok(match?.conflictingClient, "two historical cards share the phone");
});

test("reordering historical duplicate cards is not reported as a new duplicate", () => {
  const card = (id: string) => ({ id, email: null, phone: "8055550111" });
  assert.equal(findIntroducedClientIdentityDuplicate([card("A"), card("B"), card("C")], [card("B"), card("A"), card("C")]), null);
});

test("an update locks the identities it gives up and checks only changed contacts", async () => {
  const { lockClientIdentityUpdate } = await import("./client-identity");
  const locked: string[] = [];
  const tx = {
    client: { findUnique: async () => ({ phone: "(805) 555-0100", email: "old@example.com" }) },
    $executeRaw: async (_parts: TemplateStringsArray, key: string) => { locked.push(key); return 0; },
  } as never;
  const changed = await lockClientIdentityUpdate(tx, "A", { phone: "+1 805 555 0100", email: "new@example.com" });
  assert.deepEqual(changed, { phone: null, email: "new@example.com" }, "unchanged phone is not re-checked");
  assert.ok(locked.some((key) => key.includes("old@example.com")), "the email being given up is locked");
  assert.ok(locked.some((key) => key.includes("new@example.com")));
});
