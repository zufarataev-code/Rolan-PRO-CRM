import assert from "node:assert/strict";
import test from "node:test";

import { destinationForRoles } from "./destination";

test("владелец и менеджер попадают в рабочую CRM", () => {
  assert.equal(destinationForRoles(["OWNER"]), "/legacy-crm");
  assert.equal(destinationForRoles(["MANAGER"]), "/legacy-crm");
});

test("полевые роли попадают в свои экраны", () => {
  assert.equal(destinationForRoles(["CONSULTANT"]), "/legacy-crm/survey");
  assert.equal(destinationForRoles(["INSTALLER"]), "/legacy-crm/installer");
});

test("при нескольких ролях выигрывает более широкая", () => {
  assert.equal(destinationForRoles(["INSTALLER", "CONSULTANT"]), "/legacy-crm/survey");
  assert.equal(destinationForRoles(["MANAGER", "CONSULTANT"]), "/legacy-crm");
});

test("без известных ролей пользователь остаётся на входе", () => {
  assert.equal(destinationForRoles([]), "/login");
  assert.equal(destinationForRoles(["UNKNOWN"]), "/login");
});
