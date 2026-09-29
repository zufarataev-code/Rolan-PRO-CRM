import assert from "node:assert/strict";
import test from "node:test";

import { applyEmployeeDirectory, legacyIdForUser, legacyRoleForServerRoles, type DirectoryMember } from "./directory";

const alan: DirectoryMember = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "alan@example.com",
  fullName: "Alan",
  roles: ["CONSULTANT", "INSTALLER"],
  isActive: true,
  legacyUserIds: ["u_z1"],
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
  assert.equal(card.role, "measurer");
  assert.equal(card.active, true);
  assert.equal(card.phone, "+1 805 555 0100", "legacy-only fields are kept");
  assert.equal(payload.users[0].role, "installer", "input payload is not mutated");
});

test("an employee without a card gets one, so login never depends on a browser sync", () => {
  const member = { ...alan, legacyUserIds: [legacyIdForUser(alan.userId)] };
  const result = applyEmployeeDirectory({ users: [] }, [member]);
  const cards = result.users as Array<Record<string, unknown>>;

  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, legacyIdForUser(alan.userId));
  assert.equal(cards[0].role, "measurer");
});

test("cards not linked to any employee are kept for historical orders", () => {
  const result = applyEmployeeDirectory(
    { users: [{ id: "u_old", name: "Former installer", role: "installer", active: true }] },
    [alan],
  );
  const ids = (result.users as Array<{ id: string }>).map((card) => card.id).sort();

  assert.deepEqual(ids, ["u_old", "u_z1"]);
});

test("disabling an employee in PostgreSQL disables the card", () => {
  const result = applyEmployeeDirectory({ users: [{ id: "u_z1", role: "measurer", active: true }] }, [
    { ...alan, isActive: false },
  ]);

  assert.equal((result.users as Array<{ active: boolean }>)[0].active, false);
});
