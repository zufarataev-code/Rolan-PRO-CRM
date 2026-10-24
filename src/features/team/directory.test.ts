import assert from "node:assert/strict";
import test from "node:test";

import {
  applyEmployeeDirectory,
  legacyIdForUser,
  legacyIdsForRoles,
  legacyRoleForServerRoles,
  legacyRolesForServerRoles,
  type DirectoryMember,
} from "./directory";

const alan: DirectoryMember = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "alan@example.com",
  fullName: "Alan",
  roles: ["CONSULTANT", "INSTALLER"],
  isActive: true,
  legacyUserIds: ["u_z1", "u_i1"],
};

test("server roles map to one legacy role by priority", () => {
  assert.equal(legacyRoleForServerRoles(["INSTALLER", "OWNER"]), "owner");
  assert.equal(legacyRoleForServerRoles(["INSTALLER", "MANAGER"]), "manager");
  assert.equal(legacyRoleForServerRoles(["INSTALLER", "CONSULTANT"]), "measurer");
  assert.equal(legacyRoleForServerRoles(["INSTALLER"]), "installer");
  assert.equal(legacyRoleForServerRoles(["AI_SERVICE"]), null);
});

test("a stored card cannot override name, email, role or access from PostgreSQL", () => {
  const payload = {
    users: [
      // Legacy code used to force fixed roles on built-in ids such as u_z1.
      { id: "u_z1", name: "Old name", email: "old@example.com", role: "installer", active: false, phone: "+1 805 555 0100" },
    ],
  };

  const result = applyEmployeeDirectory(payload, [alan]);
  const card = (result.users as Array<Record<string, unknown>>)[0];

  assert.equal(card.name, "Alan");
  assert.equal(card.email, "alan@example.com");
  // The card already has a role the employee holds (installer); the other role gets the other card.
  assert.equal(card.role, "installer");
  assert.equal(card.active, true);
  assert.equal(card.phone, "+1 805 555 0100", "legacy-only fields are kept");
  assert.equal(payload.users[0].role, "installer", "input payload is not mutated");
});

test("an employee without a card gets one per role, so login never depends on a browser sync", () => {
  const ids = legacyIdsForRoles(alan.userId, [], legacyRolesForServerRoles(alan.roles));
  const result = applyEmployeeDirectory({ users: [] }, [{ ...alan, legacyUserIds: ids }]);
  const cards = result.users as Array<Record<string, unknown>>;

  assert.deepEqual(ids, [legacyIdForUser(alan.userId), `${legacyIdForUser(alan.userId)}_installer`]);
  assert.deepEqual(cards.map((card) => card.role), ["measurer", "installer"]);
});

test("a surveyor + installer keeps one card per role (production u_z1 / u_i1)", () => {
  const payload = {
    users: [
      { id: "u_z1", role: "measurer", active: true },
      { id: "u_i1", role: "installer", active: true },
    ],
  };
  const cards = applyEmployeeDirectory(payload, [alan]).users as Array<Record<string, unknown>>;
  assert.deepEqual(cards.map((card) => [card.id, card.role, card.active]), [
    ["u_z1", "measurer", true],
    ["u_i1", "installer", true],
  ]);

  // Installer role removed: the installer card is switched off, not turned into a second surveyor.
  const surveyorOnly = applyEmployeeDirectory(payload, [{ ...alan, roles: ["CONSULTANT"] }]).users as Array<Record<string, unknown>>;
  assert.deepEqual(surveyorOnly.map((card) => [card.id, card.role, card.active]), [
    ["u_z1", "measurer", true],
    ["u_i1", "measurer", false],
  ]);
});

test("cards not linked to any employee are kept for historical orders, but switched off", () => {
  const result = applyEmployeeDirectory(
    { users: [{ id: "u_old", name: "Former installer", role: "installer", active: true }] },
    [alan],
  );
  const cards = result.users as Array<{ id: string; active: boolean }>;
  const ids = cards.map((card) => card.id).sort();

  assert.deepEqual(ids, ["u_i1", "u_old", "u_z1"]);
  // The former employee is a ghost: it must not be offered as crew, manager or
  // task assignee again (Owner, 2026-10-20), yet the card and its id remain.
  assert.equal(cards.find((card) => card.id === "u_old")?.active, false);
  assert.ok(cards.filter((card) => card.id !== "u_old").every((card) => card.active === true));
});

test("a card re-linked to an employee is switched back on", () => {
  const result = applyEmployeeDirectory(
    { users: [{ id: "u_z1", name: "Alan", role: "measurer", active: false }] },
    [alan],
  );
  assert.equal((result.users as Array<{ id: string; active: boolean }>).find((card) => card.id === "u_z1")?.active, true);
});

test("disabling an employee in PostgreSQL disables the card", () => {
  const result = applyEmployeeDirectory({ users: [{ id: "u_z1", role: "measurer", active: true }] }, [
    { ...alan, isActive: false },
  ]);

  assert.ok((result.users as Array<{ active: boolean }>).every((card) => card.active === false));
});

test("an unlinked employee reuses their existing card by email, keeping assigned orders", async () => {
  const { resolveLegacyIdForUser } = await import("./directory");
  const payloadUsers = [
    { id: "u_i1", email: "Rinat@Example.com ", role: "installer" },
    { id: "u_i2", email: "taken@example.com", role: "installer" },
  ];
  const user = { user_id: "22222222-2222-4222-8222-222222222222", email: "rinat@example.com" };

  assert.equal(resolveLegacyIdForUser(user, payloadUsers, new Set()), "u_i1");
  assert.equal(
    resolveLegacyIdForUser({ ...user, email: "taken@example.com" }, payloadUsers, new Set(["u_i2"])),
    legacyIdForUser(user.user_id),
    "a card already linked to another employee is never taken over",
  );
});

test("a new role card never reuses an id that already exists", () => {
  const ids = legacyIdsForRoles(alan.userId, ["u_z1"], ["measurer", "installer"], new Set(["u_z1_installer"]));
  assert.deepEqual(ids, ["u_z1", "u_z1_installer_2"]);
});

test("a new employee never takes over an unrelated historical card with the same generated id", async () => {
  const { resolveLegacyIdForUser, legacyIdForUser } = await import("./directory");
  const user = { user_id: "55555555-5555-4555-8555-555555555555", email: "new@example.com" };
  const base = legacyIdForUser(user.user_id);
  const id = resolveLegacyIdForUser(user, [{ id: base, email: "someone-else@example.com" }], new Set());
  assert.notEqual(id, base);
});

test("isolated role preview derives a field card from a manager identity without changing source data", () => {
  const payload = {users:[{id:"manager-card",role:"manager",name:"Manager"}]};
  const member: DirectoryMember = {...alan, roles:["MANAGER","CONSULTANT"], legacyUserIds:["manager-card"]};
  const normal = applyEmployeeDirectory(payload,[member]);
  assert.equal(normal.users[0].role,"manager");
  const preview = applyEmployeeDirectory(payload,[{...member,roles:["CONSULTANT"]}]);
  assert.equal(preview.users[0].role,"measurer");
  assert.equal(preview.users[0].id,"manager-card");
  assert.equal(payload.users[0].role,"manager");
  assert.deepEqual(member.roles,["MANAGER","CONSULTANT"]);
});

test("a card shared by two employees goes to the one whose email is on it; the other gets its own", async () => {
  const { resolveSharedLegacyIds } = await import("./directory");
  // Production, 2026-10-24: installer and consultant both linked to u_z1/u_i1.
  const installer = { user_id: "inst", email: "zufa2012@yandex.ru", legacy_user_ids: ["u_z1", "u_i1"] };
  const consultant = { user_id: "cons", email: "ataevzufar888@gmail.com", legacy_user_ids: ["u_z1", "u_i1"] };
  const cards = [
    { id: "u_z1", email: "ataevzufar888@gmail.com", role: "measurer" },
    { id: "u_i1", email: "ataevzufar888@gmail.com", role: "measurer" },
  ];
  const own = resolveSharedLegacyIds([installer, consultant], cards);
  assert.deepEqual(own.get("cons"), ["u_z1", "u_i1"]);
  assert.deepEqual(own.get("inst"), [], "the installer loses the shared cards and gets a new one");
  // No email on the card: the first employee keeps it.
  const first = resolveSharedLegacyIds([installer, consultant], [{ id: "u_z1" }, { id: "u_i1" }]);
  assert.deepEqual(first.get("inst"), ["u_z1", "u_i1"]);
  assert.deepEqual(first.get("cons"), []);
  // Unshared ids are untouched.
  const solo = resolveSharedLegacyIds([{ user_id: "a", email: "a@x", legacy_user_ids: ["u_a"] }], []);
  assert.deepEqual(solo.get("a"), ["u_a"]);
});
