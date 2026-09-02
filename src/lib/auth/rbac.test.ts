import assert from "node:assert/strict";
import test from "node:test";

import { ROLE_CODES } from "@/lib/auth/constants";
import { getRolesForPath } from "@/lib/auth/rbac";

test("manager can use the dedicated pricing API without gaining other settings access", () => {
  assert.deepEqual(getRolesForPath("/api/v1/settings/pricing"), [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  assert.deepEqual(getRolesForPath("/api/v1/settings/company-overhead"), [ROLE_CODES.OWNER]);
});
