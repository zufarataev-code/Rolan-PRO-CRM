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

test("group links reach the legacy cards: lead flag and the lead's card id", () => {
  const lead: DirectoryMember = {
    userId: "33333333-3333-4333-8333-333333333333",
    email: "lead@example.com",
    fullName: "Lead",
    roles: ["INSTALLER", "INSTALLER_LEAD"],
    isActive: true,
    legacyUserIds: ["u_lead"],
  };
  const installer: DirectoryMember = {
    userId: "44444444-4444-4444-8444-444444444444",
    email: "inst@example.com",
    fullName: "Inst",
    roles: ["INSTALLER"],
    isActive: true,
    legacyUserIds: ["u_inst"],
    installerLeadId: lead.userId,
  };
  const result = applyEmployeeDirectory({ users: [] }, [lead, installer]);
  const cards = Object.fromEntries((result.users as Array<Record<string, unknown>>).map((card) => [card.id, card]));
  assert.equal(cards.u_lead.installerLead, true);
  assert.equal(cards.u_inst.groupLeadId, "u_lead");
  assert.equal(cards.u_inst.installerLead, false);
});
