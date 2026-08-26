import assert from "node:assert/strict";
import test from "node:test";

import { destinationForRoles } from "./destination";

test("employees land in the workspace for their role", () => {
  assert.equal(destinationForRoles(["OWNER"]), "/owner");
  assert.equal(destinationForRoles(["MANAGER"]), "/manager");
  assert.equal(destinationForRoles(["CONSULTANT"]), "/survey");
  assert.equal(destinationForRoles(["INSTALLER"]), "/installer");
});

test("the more privileged operational role wins when a user has several roles", () => {
  assert.equal(destinationForRoles(["INSTALLER", "CONSULTANT"]), "/survey");
  assert.equal(destinationForRoles(["MANAGER", "CONSULTANT"]), "/manager");
});
