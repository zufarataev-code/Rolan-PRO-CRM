import assert from "node:assert/strict";
import test from "node:test";

import { ROLE_CODES } from "@/lib/auth/constants";
import { getRolesForPath } from "@/lib/auth/rbac";

test("manager can use the dedicated pricing API without gaining other settings access", () => {
  assert.deepEqual(getRolesForPath("/api/v1/settings/pricing"), [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
  assert.deepEqual(getRolesForPath("/api/v1/settings/company-overhead"), [ROLE_CODES.OWNER]);
});

test("field workspaces live inside legacy-crm without opening the owner workspace", () => {
  assert.deepEqual(getRolesForPath("/legacy-crm/survey"), [
    ROLE_CODES.OWNER,
    ROLE_CODES.MANAGER,
    ROLE_CODES.CONSULTANT,
  ]);
  assert.deepEqual(getRolesForPath("/legacy-crm/installer/jobs/job_123"), [ROLE_CODES.INSTALLER]);
  assert.deepEqual(getRolesForPath("/legacy-crm"), [ROLE_CODES.OWNER, ROLE_CODES.MANAGER]);
});
