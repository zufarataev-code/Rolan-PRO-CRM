import assert from "node:assert/strict";
import test from "node:test";

import { destinationForRoles } from "./destination";

test("владелец и менеджер попадают в новый интерфейс /crm", () => {
  assert.equal(destinationForRoles(["OWNER"]), "/crm");
  assert.equal(destinationForRoles(["MANAGER"]), "/crm");
});

test("полевые роли попадают в ту же рабочую CRM", () => {
  assert.equal(destinationForRoles(["CONSULTANT"]), "/legacy-crm");
  assert.equal(destinationForRoles(["INSTALLER"]), "/legacy-crm");
});

test("при нескольких ролях выигрывает более широкая", () => {
  assert.equal(destinationForRoles(["INSTALLER", "CONSULTANT"]), "/legacy-crm");
  assert.equal(destinationForRoles(["MANAGER", "CONSULTANT"]), "/crm");
});

test("без известных ролей пользователь остаётся на входе", () => {
  assert.equal(destinationForRoles([]), "/login");
  assert.equal(destinationForRoles(["UNKNOWN"]), "/login");
});
